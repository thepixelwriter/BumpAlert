import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Motion, type AccelListenerEvent } from '@capacitor/motion';
import { Geolocation } from '@capacitor/geolocation';
import type { PluginListenerHandle } from '@capacitor/core';
import { PotholeReport, HazardSeverity } from '../models/pothole-report.model';

/** Standard gravity, used as the baseline to subtract from raw accelerometer readings. */
const GRAVITY_G = 9.80665;

/** Below this delta the reading is considered normal road vibration and ignored. */
const MODERATE_G_THRESHOLD = 1.8;

/** At/above this delta the bump is classified as severe (typical for Indian road potholes). */
const SEVERE_G_THRESHOLD = 2.2;

/** Minimum time between two accepted detections, to avoid duplicate triggers from one bump. */
const DETECTION_COOLDOWN_MS = 2000;

@Injectable({
  providedIn: 'root',
})
export class SensorDetectionService implements OnDestroy {
  private motionListener: PluginListenerHandle | null = null;
  private lastDetectionAt = 0;

  private readonly pendingReportsSubject = new BehaviorSubject<PotholeReport[]>([]);
  /** All events captured during the current trip that haven't been finalized yet. */
  readonly pendingReports$: Observable<PotholeReport[]> = this.pendingReportsSubject.asObservable();

  private readonly potholeDetectedSubject = new Subject<PotholeReport>();
  /** Emits the instant a new spike is detected, for the dashboard alert card. */
  readonly potholeDetected$: Observable<PotholeReport> = this.potholeDetectedSubject.asObservable();

  private readonly liveGForceSubject = new Subject<number>();
  /** Emits every raw accelerometer sample's g-force delta, for live meters/sparkline UI. */
  readonly liveGForce$: Observable<number> = this.liveGForceSubject.asObservable();

  private listening = false;

  async startListening(): Promise<void> {
    if (this.listening) {
      return;
    }
    this.listening = true;
    this.motionListener = await Motion.addListener('accel', (event) => this.handleAccelEvent(event));
  }

  async stopListening(): Promise<void> {
    this.listening = false;
    await this.motionListener?.remove();
    this.motionListener = null;
  }

  private handleAccelEvent(event: AccelListenerEvent): void {
    this.liveGForceSubject.next(this.toGForce(event.acceleration.z));

    const now = Date.now();
    if (now - this.lastDetectionAt < DETECTION_COOLDOWN_MS) {
      return;
    }

    const severity = this.classifySpike(event.acceleration.z);
    if (!severity) {
      return;
    }

    this.lastDetectionAt = now;
    const gForce = this.toGForce(event.acceleration.z);
    void this.captureDetection(gForce, severity);
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
  }
}
