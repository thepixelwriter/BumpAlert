import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { SensorDetectionService, PermissionState, LiveAcceleration, LiveLocation } from '../../services/sensor-detection.service';
import { PotholeReport } from '../../models/pothole-report.model';

const SPARKLINE_SAMPLES = 40;
/** Meter scale ceiling - g-force deltas at/above this render as a "full" bar. */
const METER_MAX_G = 3;

@Component({
  selector: 'app-detection',
  templateUrl: './detection.page.html',
  styleUrls: ['./detection.page.scss'],
  standalone: false,
})
export class DetectionPage implements OnInit, OnDestroy {
  detectionEnabled = false;
  lastDetected: PotholeReport | null = null;
  pendingReports: PotholeReport[] = [];
  statusMessage = 'Starting detection…';

  /** Current live g-force delta, 0 -> ~3+. Drives the strength meter. */
  currentGForce = 0;
  /** Rolling sample history for the sparkline bars. */
  sparkline: number[] = new Array(SPARKLINE_SAMPLES).fill(0);

  /** Raw accelerometer axes (m/s^2), for the live readout. */
  liveAcceleration: LiveAcceleration = { x: 0, y: 0, z: 0 };
  /** Latest GPS fix, for the live readout. */
  liveLocation: LiveLocation | null = null;

  motionPermission: PermissionState = 'unknown';
  locationPermission: PermissionState = 'unknown';

  mildCount = 0;
  severeCount = 0;

  /** True on iOS Safari where devicemotion needs an explicit, gesture-triggered permission prompt. */
  awaitingMotionPermission = false;

  private pendingSub?: Subscription;
  private detectSub?: Subscription;
  private liveSub?: Subscription;
  private liveAccelSub?: Subscription;
  private motionPermSub?: Subscription;
  private locationSub?: Subscription;
  private locationPermSub?: Subscription;

  constructor(private readonly sensorDetection: SensorDetectionService) {}

  async ngOnInit(): Promise<void> {
    this.pendingSub = this.sensorDetection.pendingReports$.subscribe((reports) => {
      this.pendingReports = reports;
      this.mildCount = reports.filter((r) => r.severity === 'moderate').length;
      this.severeCount = reports.filter((r) => r.severity === 'severe').length;
    });

    this.detectSub = this.sensorDetection.potholeDetected$.subscribe((report) => {
      this.lastDetected = report;
      this.statusMessage = `Detected ${report.severity} bump at ${new Date(report.timestamp).toLocaleTimeString()}`;
    });

    this.liveSub = this.sensorDetection.liveGForce$.subscribe((gForce) => {
      this.currentGForce = gForce;
      this.sparkline = [...this.sparkline.slice(1), Math.min(gForce, METER_MAX_G)];
    });

    this.liveAccelSub = this.sensorDetection.liveAcceleration$.subscribe((axes) => {
      this.liveAcceleration = axes;
    });

    this.motionPermSub = this.sensorDetection.motionPermissionState$.subscribe((state) => {
      this.motionPermission = state;
    });

    this.locationSub = this.sensorDetection.liveLocation$.subscribe((location) => {
      this.liveLocation = location;
    });

    this.locationPermSub = this.sensorDetection.locationPermissionState$.subscribe((state) => {
      this.locationPermission = state;
    });

    void this.sensorDetection.refreshLocationPermissionState();
    void this.sensorDetection.startLocationWatch();

    // Detection screen is the app's default/home tab, so start listening immediately -
    // unless this browser needs a user gesture to grant motion permission first (iOS Safari).
    if (this.sensorDetection.needsMotionPermissionPrompt()) {
      this.awaitingMotionPermission = true;
      this.motionPermission = 'prompt';
      this.statusMessage = 'Tap "Enable Motion Access" below to allow bump detection.';
      return;
    }
    await this.toggleDetection(true);
  }

  async ngOnDestroy(): Promise<void> {
    this.pendingSub?.unsubscribe();
    this.detectSub?.unsubscribe();
    this.liveSub?.unsubscribe();
    this.liveAccelSub?.unsubscribe();
    this.motionPermSub?.unsubscribe();
    this.locationSub?.unsubscribe();
    this.locationPermSub?.unsubscribe();
    await this.sensorDetection.stopListening();
    await this.sensorDetection.stopLocationWatch();
  }

  async toggleDetection(forceOn?: boolean): Promise<void> {
    const shouldEnable = forceOn ?? !this.detectionEnabled;

    if (!shouldEnable) {
      await this.sensorDetection.stopListening();
      this.detectionEnabled = false;
      this.statusMessage = 'Detection is off';
      return;
    }

    try {
      await this.sensorDetection.startListening();
      this.detectionEnabled = true;
      this.statusMessage = 'Detection is running';
    } catch (error) {
      console.error('Failed to enable motion detection', error);
      this.detectionEnabled = false;
      this.statusMessage = 'Motion detection could not start. Check device sensor permissions.';
    }
  }

  clearReports(): void {
    this.sensorDetection.clearAll();
    this.lastDetected = null;
    this.statusMessage = this.detectionEnabled ? 'Detection is running' : 'Detection is off';
  }

  /** Must run inside the click handler - iOS only grants motion access from a direct user gesture. */
  async enableMotionAccess(): Promise<void> {
    const granted = await this.sensorDetection.requestMotionPermission();
    this.awaitingMotionPermission = false;
    if (!granted) {
      this.statusMessage = 'Motion access denied. Enable it in Safari Settings > Motion & Orientation Access.';
      return;
    }
    await this.toggleDetection(true);
  }

  /** Meter fill 0-100 based on the current live g-force delta. */
  get meterPercent(): number {
    return Math.min((this.currentGForce / METER_MAX_G) * 100, 100);
  }

  get meterColor(): string {
    if (this.currentGForce >= 2.2) return 'danger';
    if (this.currentGForce >= 1.8) return 'warning';
    return 'success';
  }

  exportReports(): void {
    const payload = JSON.stringify(this.pendingReports, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bumpalert-detections-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  permissionLabel(state: PermissionState): string {
    switch (state) {
      case 'granted':
        return 'Granted';
      case 'denied':
        return 'Denied';
      case 'prompt':
        return 'Pending';
      case 'not-required':
        return 'OK';
      default:
        return 'Unknown';
    }
  }

  permissionColor(state: PermissionState): string {
    switch (state) {
      case 'granted':
      case 'not-required':
        return 'success';
      case 'denied':
        return 'danger';
      case 'prompt':
        return 'warning';
      default:
        return 'medium';
    }
  }
}
