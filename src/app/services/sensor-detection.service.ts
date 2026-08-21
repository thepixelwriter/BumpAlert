import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { Motion, type AccelListenerEvent } from '@capacitor/motion';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { PotholeReport, HazardSeverity } from '../models/pothole-report.model';
import { ReportStorageService } from './report-storage.service';
import { BackgroundBumpDetection } from './background-bump-detection';

/** Batches rapid successive queue updates (e.g. bulk markSubmitted) into a single IndexedDB write. */
const PERSIST_DEBOUNCE_MS = 400;

/** Standard gravity, used as the baseline to subtract from raw accelerometer readings. */
const GRAVITY_G = 9.80665;

/** Below this delta the reading is considered normal road vibration and ignored. */
const MODERATE_G_THRESHOLD = 1.8;

/** At/above this delta the bump is classified as severe (typical for Indian road potholes). */
const SEVERE_G_THRESHOLD = 2.2;

/** Minimum time between two accepted detections, to avoid duplicate triggers from one bump. */
const DETECTION_COOLDOWN_MS = 2000;

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'not-required' | 'unknown';

export interface LiveAcceleration {
  x: number;
  y: number;
  z: number;
}

export interface LiveLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class SensorDetectionService implements OnDestroy {
  private motionListener: PluginListenerHandle | null = null;
  private lastDetectionAt = 0;
  private locationWatchId: string | null = null;

  private readonly pendingReportsSubject = new BehaviorSubject<PotholeReport[]>([]);
  /** All events captured during the current trip that haven't been finalized yet. */
  readonly pendingReports$: Observable<PotholeReport[]> = this.pendingReportsSubject.asObservable();

  private readonly potholeDetectedSubject = new Subject<PotholeReport>();
  /** Emits the instant a new spike is detected, for the dashboard alert card. */
  readonly potholeDetected$: Observable<PotholeReport> = this.potholeDetectedSubject.asObservable();

  private readonly liveGForceSubject = new Subject<number>();
  /** Emits every raw accelerometer sample's g-force delta, for live meters/sparkline UI. */
  readonly liveGForce$: Observable<number> = this.liveGForceSubject.asObservable();

  private readonly liveAccelerationSubject = new Subject<LiveAcceleration>();
  /** Emits every raw accelerometer sample's X/Y/Z axes (m/s^2), for a live readout. */
  readonly liveAcceleration$: Observable<LiveAcceleration> = this.liveAccelerationSubject.asObservable();

  private readonly motionPermissionSubject = new BehaviorSubject<PermissionState>('unknown');
  readonly motionPermissionState$: Observable<PermissionState> = this.motionPermissionSubject.asObservable();

  private readonly liveLocationSubject = new BehaviorSubject<LiveLocation | null>(null);
  /** Latest GPS fix while the live location watch is active. */
  readonly liveLocation$: Observable<LiveLocation | null> = this.liveLocationSubject.asObservable();

  private readonly locationPermissionSubject = new BehaviorSubject<PermissionState>('unknown');
  readonly locationPermissionState$: Observable<PermissionState> = this.locationPermissionSubject.asObservable();

  private listening = false;

  constructor(private readonly reportStorage: ReportStorageService) {
    void this.restorePersistedReports();
    this.pendingReports$.pipe(debounceTime(PERSIST_DEBOUNCE_MS)).subscribe((reports) => this.persistReports(reports));

    // Bumps captured natively while minimized only surface once the app is foregrounded again.
    void App.addListener('resume', () => void this.drainNativeBackgroundReports());
  }

  /** Only Android can keep sampling the accelerometer/GPS while minimized - see BumpDetectionService.java. */
  private isBackgroundDetectionSupported(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  private async drainNativeBackgroundReports(): Promise<void> {
    if (!this.isBackgroundDetectionSupported()) {
      return;
    }
    try {
      const { reports } = await BackgroundBumpDetection.drainReports();
      if (!reports.length) {
        return;
      }
      const existingIds = new Set(this.pendingReportsSubject.value.map((r) => r.id));
      const newReports: PotholeReport[] = reports
        .filter((r) => !existingIds.has(r.id))
        .map((r) => ({ ...r, status: 'pending' as const }));
      if (!newReports.length) {
        return;
      }
      this.pendingReportsSubject.next([...this.pendingReportsSubject.value, ...newReports]);
      this.potholeDetectedSubject.next(newReports[newReports.length - 1]);
    } catch (error) {
      console.warn('BumpAlert: unable to drain background-detected reports', error);
    }
  }

  /** Auto-resume: reloads any reports left over from a killed/frozen tab before the user notices. */
  private async restorePersistedReports(): Promise<void> {
    try {
      const stored = await this.reportStorage.loadAll();
      if (stored.length) {
        this.pendingReportsSubject.next(stored);
      }
    } catch (error) {
      console.warn('BumpAlert: unable to restore persisted reports', error);
    }
  }

  private persistReports(reports: PotholeReport[]): void {
    void this.reportStorage.replaceAll(reports).catch((error) => {
      console.warn('BumpAlert: unable to persist pending reports', error);
    });
  }

  async startListening(): Promise<void> {
    if (this.listening) {
      return;
    }
    this.listening = true;
    this.motionListener = await Motion.addListener('accel', (event) => this.handleAccelEvent(event));
    if (!this.needsMotionPermissionPrompt()) {
      this.motionPermissionSubject.next('not-required');
    }

    if (this.isBackgroundDetectionSupported()) {
      try {
        await BackgroundBumpDetection.start();
      } catch (error) {
        console.warn('BumpAlert: unable to start background bump detection', error);
      }
    }
  }

  /** iOS Safari requires a user-gesture-triggered permission prompt before devicemotion fires. */
  needsMotionPermissionPrompt(): boolean {
    const deviceMotionEventCtor = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
    return typeof deviceMotionEventCtor?.requestPermission === 'function';
  }

  async requestMotionPermission(): Promise<boolean> {
    const deviceMotionEventCtor = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
    if (typeof deviceMotionEventCtor?.requestPermission !== 'function') {
      this.motionPermissionSubject.next('not-required');
      return true;
    }
    try {
      const result = await deviceMotionEventCtor.requestPermission();
      this.motionPermissionSubject.next(result === 'granted' ? 'granted' : 'denied');
      return result === 'granted';
    } catch (error) {
      console.warn('BumpAlert: motion permission request failed', error);
      this.motionPermissionSubject.next('denied');
      return false;
    }
  }

  async stopListening(): Promise<void> {
    this.listening = false;
    await this.motionListener?.remove();
    this.motionListener = null;

    if (this.isBackgroundDetectionSupported()) {
      try {
        await BackgroundBumpDetection.stop();
      } catch (error) {
        console.warn('BumpAlert: unable to stop background bump detection', error);
      }
    }
  }

  /** Starts a continuous GPS watch purely for the live readout - separate from per-detection capture. */
  async startLocationWatch(): Promise<void> {
    if (this.locationWatchId) {
      return;
    }
    try {
      this.locationWatchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 10000 },
        (position, err) => {
          if (err || !position) {
            return;
          }
          this.locationPermissionSubject.next('granted');
          this.liveLocationSubject.next({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
      );
    } catch (error) {
      console.warn('BumpAlert: unable to start location watch', error);
      this.locationPermissionSubject.next('denied');
    }
  }

  async stopLocationWatch(): Promise<void> {
    if (this.locationWatchId) {
      await Geolocation.clearWatch({ id: this.locationWatchId });
      this.locationWatchId = null;
    }
  }

  /** Best-effort permission read via the Permissions API - unsupported on some Safari versions. */
  async refreshLocationPermissionState(): Promise<void> {
    try {
      const result = await Geolocation.checkPermissions();
      this.locationPermissionSubject.next(result.location as PermissionState);
    } catch {
      this.locationPermissionSubject.next('unknown');
    }
  }

  private handleAccelEvent(event: AccelListenerEvent): void {
    const zAcceleration = this.extractGravityInclusiveZ(event);
    if (zAcceleration === null) {
      return;
    }

    this.liveAccelerationSubject.next(this.extractAxes(event, zAcceleration));
    this.liveGForceSubject.next(this.toGForce(zAcceleration));

    const now = Date.now();
    if (now - this.lastDetectionAt < DETECTION_COOLDOWN_MS) {
      return;
    }

    const severity = this.classifySpike(zAcceleration);
    if (!severity) {
      return;
    }

    this.lastDetectionAt = now;
    const gForce = this.toGForce(zAcceleration);
    void this.captureDetection(gForce, severity);
  }

  /** iOS Safari frequently leaves the gravity-excluded `acceleration` field null; `accelerationIncludingGravity` is reliable. */
  private extractGravityInclusiveZ(event: AccelListenerEvent): number | null {
    const withGravity = event.accelerationIncludingGravity?.z;
    if (typeof withGravity === 'number') {
      return withGravity;
    }
    const withoutGravity = event.acceleration?.z;
    if (typeof withoutGravity === 'number') {
      return withoutGravity + GRAVITY_G;
    }
    return null;
  }

  /** X/Y for the live readout - reuses whichever field was populated for Z above. */
  private extractAxes(event: AccelListenerEvent, resolvedZ: number): LiveAcceleration {
    const source = event.accelerationIncludingGravity?.z != null ? event.accelerationIncludingGravity : event.acceleration;
    return {
      x: source?.x ?? 0,
      y: source?.y ?? 0,
      z: resolvedZ,
    };
  }

  /** Converts a raw Z-axis reading (m/s^2) into a G-force delta and classifies severity. */
  private classifySpike(zAcceleration: number): HazardSeverity | null {
    const gForceDelta = this.toGForce(zAcceleration);
    if (gForceDelta >= SEVERE_G_THRESHOLD) {
      return 'severe';
    }
    if (gForceDelta >= MODERATE_G_THRESHOLD) {
      return 'moderate';
    }
    return null;
  }

  private toGForce(zAcceleration: number): number {
    return Math.abs(Math.abs(zAcceleration) - GRAVITY_G) / GRAVITY_G;
  }

  private async captureDetection(gForce: number, severity: HazardSeverity): Promise<void> {
    const timestamp = Date.now();
    try {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 5000 });
      const report: PotholeReport = {
        id: `${timestamp}-${Math.round(gForce * 1000)}`,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timestamp,
        gForce,
        severity,
        status: 'pending',
      };
      this.addPendingReport(report);
      this.potholeDetectedSubject.next(report);
    } catch (error) {
      // Location unavailable (e.g. GPS lock lost) - drop this detection rather than crash the ride.
      console.warn('BumpAlert: unable to capture location for detected spike', error);
    }
  }

  private addPendingReport(report: PotholeReport): void {
    this.pendingReportsSubject.next([...this.pendingReportsSubject.value, report]);
  }

  confirmReport(id: string): void {
    this.updateReportStatus(id, 'confirmed');
  }

  dismissReport(id: string): void {
    this.pendingReportsSubject.next(this.pendingReportsSubject.value.filter((r) => r.id !== id));
  }

  markSubmitted(ids: string[]): void {
    const idSet = new Set(ids);
    this.pendingReportsSubject.next(
      this.pendingReportsSubject.value.map((r) => (idSet.has(r.id) ? { ...r, status: 'submitted' } : r)),
    );
  }

  clearAll(): void {
    this.pendingReportsSubject.next([]);
  }

  private updateReportStatus(id: string, status: PotholeReport['status']): void {
    this.pendingReportsSubject.next(
      this.pendingReportsSubject.value.map((r) => (r.id === id ? { ...r, status } : r)),
    );
  }

  ngOnDestroy(): void {
    void this.stopListening();
    void this.stopLocationWatch();
  }
}
