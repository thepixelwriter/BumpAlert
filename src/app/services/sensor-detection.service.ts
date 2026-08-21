import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Motion, type AccelListenerEvent } from '@capacitor/motion';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { PotholeReport, HazardSeverity } from '../models/pothole-report.model';
import { BackgroundBumpDetection } from './background-bump-detection';

/** Standard gravity, used as the baseline to subtract from raw accelerometer readings. */
const GRAVITY_G = 9.80665;

/** Below this delta the reading is considered normal road vibration and ignored. */
const MODERATE_G_THRESHOLD = 1.8;

/** At/above this delta the bump is classified as severe (typical for Indian road potholes). */
const SEVERE_G_THRESHOLD = 2.2;

/** At/above this delta the impact is classified as alarming, overriding severe/moderate. */
const ALARMING_G_THRESHOLD = 4.0;

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

  constructor() {
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
    const axes = this.extractAxes(event);
    this.liveAccelerationSubject.next(axes);

    const gForce = this.calculateGForce(event, axes);
    this.liveGForceSubject.next(gForce);

    const now = Date.now();
    if (now - this.lastDetectionAt < DETECTION_COOLDOWN_MS) {
      return;
    }

    const severity = this.classifyGForce(gForce);
    if (!severity) {
      return;
    }

    this.lastDetectionAt = now;
    void this.captureDetection(gForce, severity);
  }

  /** Calculates G-Force delta using full 3D vector magnitude for any device orientation. */
  private calculateGForce(event: AccelListenerEvent, axes: LiveAcceleration): number {
    // 1. If linear acceleration (gravity excluded) is directly provided:
    if (
      event.acceleration &&
      (typeof event.acceleration.x === 'number' ||
        typeof event.acceleration.y === 'number' ||
        typeof event.acceleration.z === 'number')
    ) {
      const ax = event.acceleration.x ?? 0;
      const ay = event.acceleration.y ?? 0;
      const az = event.acceleration.z ?? 0;
      const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
      return Math.round((magnitude / GRAVITY_G) * 100) / 100;
    }

    // 2. If gravity-inclusive acceleration is provided:
    if (
      event.accelerationIncludingGravity &&
      (typeof event.accelerationIncludingGravity.x === 'number' ||
        typeof event.accelerationIncludingGravity.y === 'number' ||
        typeof event.accelerationIncludingGravity.z === 'number')
    ) {
      const gx = event.accelerationIncludingGravity.x ?? 0;
      const gy = event.accelerationIncludingGravity.y ?? 0;
      const gz = event.accelerationIncludingGravity.z ?? 0;
      const totalMag = Math.sqrt(gx * gx + gy * gy + gz * gz);
      const delta = Math.abs(totalMag - GRAVITY_G) / GRAVITY_G;
      return Math.round(delta * 100) / 100;
    }

    // Fallback:
    const mag = Math.sqrt(axes.x * axes.x + axes.y * axes.y + axes.z * axes.z);
    return Math.round((Math.abs(mag - GRAVITY_G) / GRAVITY_G) * 100) / 100;
  }

  /** X/Y/Z axes for live telemetry readout. */
  private extractAxes(event: AccelListenerEvent): LiveAcceleration {
    const src =
      event.accelerationIncludingGravity?.z != null
        ? event.accelerationIncludingGravity
        : event.acceleration;
    return {
      x: Math.round((src?.x ?? 0) * 100) / 100,
      y: Math.round((src?.y ?? 0) * 100) / 100,
      z: Math.round((src?.z ?? 0) * 100) / 100,
    };
  }

  /** Converts G-Force reading into severity classification. */
  private classifyGForce(gForce: number): HazardSeverity | null {
    if (gForce >= ALARMING_G_THRESHOLD) {
      return 'alarming';
    }
    if (gForce >= SEVERE_G_THRESHOLD) {
      return 'severe';
    }
    if (gForce >= MODERATE_G_THRESHOLD) {
      return 'moderate';
    }
    return null;
  }

  private async captureDetection(gForce: number, severity: HazardSeverity): Promise<void> {
    const timestamp = Date.now();
    const liveLoc = this.liveLocationSubject.value;
    let latitude = liveLoc?.latitude;
    let longitude = liveLoc?.longitude;

    try {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 3500 });
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
    } catch {
      // A live GPS fix, if available, remains the source of truth.
    }

    // Do not create a geotagged road-hazard record from fabricated coordinates.
    if (latitude === undefined || longitude === undefined) return;

    const report: PotholeReport = {
      id: `${timestamp}-${Math.round(gForce * 1000)}`,
      latitude,
      longitude,
      timestamp,
      gForce,
      severity,
      status: 'pending',
    };
    this.addPendingReport(report);
    this.potholeDetectedSubject.next(report);
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
