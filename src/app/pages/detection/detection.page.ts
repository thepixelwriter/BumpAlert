import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { SensorDetectionService } from '../../services/sensor-detection.service';
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

  mildCount = 0;
  severeCount = 0;

  private pendingSub?: Subscription;
  private detectSub?: Subscription;
  private liveSub?: Subscription;

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

    // Detection screen is the app's default/home tab, so start listening immediately.
    await this.toggleDetection(true);
  }

  async ngOnDestroy(): Promise<void> {
    this.pendingSub?.unsubscribe();
    this.detectSub?.unsubscribe();
    this.liveSub?.unsubscribe();
    await this.sensorDetection.stopListening();
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
}
