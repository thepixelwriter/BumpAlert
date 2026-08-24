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

export type VehicleMode = 'bike' | 'car';

interface DetectionProfile {
  moderateG: number;
  severeG: number;
  alarmingG: number;
  cooldownMs: number;
}

const DETECTION_PROFILES: Record<VehicleMode, DetectionProfile> = {
  bike: { moderateG: 1.8, severeG: 2.2, alarmingG: 4.0, cooldownMs: 2000 },
  // Car impacts are softer, but still need speed and a short motion/elevation pattern.
  car: { moderateG: 0.9, severeG: 1.5, alarmingG: 3.2, cooldownMs: 1600 },
};
const VEHICLE_MODE_STORAGE_KEY = 'bumpalert.vehicle-mode';
const CAR_MOTION_WINDOW_MS = 550;
const ELEVATION_WINDOW_MS = 10000;

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'not-required' | 'unknown';

export interface LiveAcceleration {
  x: number;
  y: number;
  z: number;
}

/** Angular velocity around the device axes, in degrees per second. */
export interface LiveGyroscope {
  alpha: number;
  beta: number;
  gamma: number;
}

export interface LiveLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  altitude: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class SensorDetectionService implements OnDestroy {
  private readonly storageKey = 'bumpalert.telemetry-records.v1';
  private motionListener: PluginListenerHandle | null = null;
  private orientationListener: PluginListenerHandle | null = null;
  private deviceOrientationListener: ((event: DeviceOrientationEvent) => void) | null = null;
  private lastDetectionAt = 0;
  private locationWatchId: string | null = null;
  private recentMotion: Array<{ at: number; gForce: number }> = [];
  private elevationSamples: Array<{ at: number; altitude: number; speed: number; accuracy: number }> = [];
  private readonly vehicleModeSubject = new BehaviorSubject<VehicleMode>(this.restoreVehicleMode());
  readonly vehicleMode$: Observable<VehicleMode> = this.vehicleModeSubject.asObservable();

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

  private readonly liveGyroscopeSubject = new BehaviorSubject<LiveGyroscope | null>(null);
  /** Device rotation rate when the browser/device makes gyroscope data available. */
  readonly liveGyroscope$: Observable<LiveGyroscope | null> = this.liveGyroscopeSubject.asObservable();

  private readonly liveCompassSubject = new BehaviorSubject<number | null>(null);
  /** Magnetic compass heading in degrees clockwise from north. */
  readonly liveCompass$: Observable<number | null> = this.liveCompassSubject.asObservable();

  private readonly motionPermissionSubject = new BehaviorSubject<PermissionState>('unknown');
  readonly motionPermissionState$: Observable<PermissionState> = this.motionPermissionSubject.asObservable();

  private readonly liveLocationSubject = new BehaviorSubject<LiveLocation | null>(null);
  /** Latest GPS fix while the live location watch is active. */
  readonly liveLocation$: Observable<LiveLocation | null> = this.liveLocationSubject.asObservable();

  private readonly locationPermissionSubject = new BehaviorSubject<PermissionState>('unknown');
  readonly locationPermissionState$: Observable<PermissionState> = this.locationPermissionSubject.asObservable();

  private listening = false;

  get vehicleMode(): VehicleMode {
    return this.vehicleModeSubject.value;
  }

  setVehicleMode(mode: VehicleMode): void {
    this.vehicleModeSubject.next(mode);
    try { localStorage.setItem(VEHICLE_MODE_STORAGE_KEY, mode); } catch { /* storage can be unavailable */ }
    this.recentMotion = [];
    this.elevationSamples = [];
    this.lastDetectionAt = 0;
    if (this.listening && this.isBackgroundDetectionSupported()) {
      void BackgroundBumpDetection.start({ vehicleMode: mode });
    }
  }

  constructor() {
    this.restoreStoredReports();
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
      this.setReports([...this.pendingReportsSubject.value, ...newReports]);
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
    try {
      this.orientationListener = await Motion.addListener('orientation', (event) => {
        this.liveGyroscopeSubject.next({
          alpha: Math.round((event.alpha ?? 0) * 100) / 100,
          beta: Math.round((event.beta ?? 0) * 100) / 100,
          gamma: Math.round((event.gamma ?? 0) * 100) / 100,
        });
      });
      this.deviceOrientationListener = (event: DeviceOrientationEvent) => {
        const webkitHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
        const heading = typeof webkitHeading === 'number' ? webkitHeading : event.absolute ? 360 - (event.alpha ?? 0) : null;
        if (heading !== null && Number.isFinite(heading)) {
          this.liveCompassSubject.next(Math.round((((heading % 360) + 360) % 360) * 100) / 100);
        }
      };
      window.addEventListener('deviceorientationabsolute', this.deviceOrientationListener);
      window.addEventListener('deviceorientation', this.deviceOrientationListener);
    } catch (error) {
      // Gyroscope support varies by device/browser; accelerometer sensing continues.
      console.info('BumpAlert: gyroscope telemetry is unavailable', error);
    }
    if (!this.needsMotionPermissionPrompt()) {
      this.motionPermissionSubject.next('not-required');
    }

    if (this.isBackgroundDetectionSupported()) {
      try {
        await BackgroundBumpDetection.start({ vehicleMode: this.vehicleMode });
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
    const deviceOrientationEventCtor = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (typeof deviceMotionEventCtor?.requestPermission !== 'function') {
      this.motionPermissionSubject.next('not-required');
      if (typeof deviceOrientationEventCtor?.requestPermission === 'function') {
        try {
          await deviceOrientationEventCtor.requestPermission();
        } catch (error) {
          console.info('BumpAlert: compass permission was not granted', error);
        }
      }
      return true;
    }
    try {
      const result = await deviceMotionEventCtor.requestPermission();
      this.motionPermissionSubject.next(result === 'granted' ? 'granted' : 'denied');
      if (result !== 'granted') return false;
      if (typeof deviceOrientationEventCtor?.requestPermission === 'function') {
        try {
          await deviceOrientationEventCtor.requestPermission();
        } catch (error) {
          console.info('BumpAlert: compass permission was not granted', error);
        }
      }
      return true;
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
    await this.orientationListener?.remove();
    this.orientationListener = null;
    if (this.deviceOrientationListener) {
      window.removeEventListener('deviceorientationabsolute', this.deviceOrientationListener);
      window.removeEventListener('deviceorientation', this.deviceOrientationListener);
      this.deviceOrientationListener = null;
    }

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
            speed: position.coords.speed,
            altitude: position.coords.altitude,
          });
          this.recordElevation(position.coords.altitude, position.coords.speed, position.coords.accuracy);
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
    this.liveGForceSubject.next(gForce < 0.05 ? 0 : gForce);

    const now = Date.now();
    this.recentMotion = [...this.recentMotion.filter((sample) => now - sample.at <= CAR_MOTION_WINDOW_MS), { at: now, gForce }];
    const profile = DETECTION_PROFILES[this.vehicleMode];
    if (now - this.lastDetectionAt < profile.cooldownMs) {
      return;
    }

    const severity = this.classifyGForce(gForce, now);
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
  private classifyGForce(gForce: number, now: number): HazardSeverity | null {
    const profile = DETECTION_PROFILES[this.vehicleMode];
    if (gForce >= profile.alarmingG) {
      return 'alarming';
    }
    if (gForce >= profile.severeG && (this.vehicleMode === 'bike' || this.hasCarContext(gForce, now))) {
      return 'severe';
    }
    if (gForce >= profile.moderateG && (this.vehicleMode === 'bike' || this.hasCarContext(gForce, now))) {
      return 'moderate';
    }
    return null;
  }

  private hasCarContext(gForce: number, now: number): boolean {
    const hasMotionShape = this.recentMotion.length >= 2 && this.recentMotion.some((sample) => sample.gForce >= 0.5 && sample.gForce < gForce);
    return hasMotionShape || (gForce >= 0.65 && this.hasElevationSupport(now));
  }

  private recordElevation(altitude: number | null, speed: number | null, accuracy: number | null): void {
    if (this.vehicleMode !== 'car' || altitude === null || speed === null || accuracy === null || accuracy > 30 || speed < 2 || speed > 35) {
      return;
    }
    const now = Date.now();
    this.elevationSamples = [
      ...this.elevationSamples.filter((sample) => now - sample.at <= ELEVATION_WINDOW_MS),
      { at: now, altitude, speed, accuracy },
    ];
  }

  /** Accept only a local rise followed by a peak, optionally already followed by a fall. */
  private hasElevationSupport(now: number): boolean {
    const samples = this.elevationSamples.filter((sample) => now - sample.at <= ELEVATION_WINDOW_MS);
    if (samples.length < 3) return false;
    const peakIndex = samples.reduce((index, sample, candidateIndex, all) => sample.altitude > all[index].altitude ? candidateIndex : index, 0);
    if (peakIndex === 0) return false;
    const rise = samples[peakIndex].altitude - samples[0].altitude;
    const fall = samples[peakIndex].altitude - samples[samples.length - 1].altitude;
    return rise >= 0.7 && (fall >= 0.3 || now - samples[peakIndex].at <= 2200);
  }

  private restoreVehicleMode(): VehicleMode {
    try {
      return localStorage.getItem(VEHICLE_MODE_STORAGE_KEY) === 'car' ? 'car' : 'bike';
    } catch {
      return 'bike';
    }
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
    this.setReports([...this.pendingReportsSubject.value, report]);
  }

  confirmReport(id: string): void {
    this.updateReportStatus(id, 'confirmed');
  }

  dismissReport(id: string): void {
    this.setReports(this.pendingReportsSubject.value.filter((r) => r.id !== id));
  }

  markSubmitted(ids: string[]): void {
    const idSet = new Set(ids);
    this.setReports(
      this.pendingReportsSubject.value.map((r) => (idSet.has(r.id) ? { ...r, status: 'submitted' } : r)),
    );
  }

  clearAll(): void {
    this.setReports([]);
  }

  private updateReportStatus(id: string, status: PotholeReport['status']): void {
    this.setReports(
      this.pendingReportsSubject.value.map((r) => (r.id === id ? { ...r, status } : r)),
    );
  }

  private setReports(reports: PotholeReport[]): void {
    this.pendingReportsSubject.next(reports);
    try { localStorage.setItem(this.storageKey, JSON.stringify(reports)); } catch { /* storage can be unavailable */ }
  }

  private restoreStoredReports(): void {
    try {
      const parsed = JSON.parse(localStorage.getItem(this.storageKey) || '[]') as PotholeReport[];
      if (Array.isArray(parsed)) this.pendingReportsSubject.next(parsed.filter((report) => report?.id && Number.isFinite(report.timestamp)));
    } catch { /* start clean if a stale record cannot be read */ }
  }

  ngOnDestroy(): void {
    void this.stopListening();
    void this.stopLocationWatch();
  }
}
