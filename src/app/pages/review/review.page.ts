import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ToastController, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { HazardSeverity, PotholeReport, TelemetryCluster } from '../../models/pothole-report.model';
import { TelemetryService } from '../../services/telemetry.service';
import { GrievanceShareService } from '../../services/grievance-share.service';
import { LiveAcceleration, LiveGyroscope, LiveLocation, PermissionState, SensorDetectionService } from '../../services/sensor-detection.service';

const DISPLAY_ANOMALY_THRESHOLD_G = 1.8;

@Component({
  selector: 'app-review',
  templateUrl: './review.page.html',
  styleUrls: ['./review.page.scss'],
  standalone: false,
})
export class ReviewPage implements OnInit, OnDestroy {
  clusters: TelemetryCluster[] = [];
  rawReports: PotholeReport[] = [];

  // Clusters are collapsed by default
  expandedClusterIds = new Set<string>();

  // Summary statistics
  totalHazardsCount = 0;
  alarmingCount = 0;
  severeCount = 0;
  moderateCount = 0;
  maxGForce = 0;

  // Live telemetry streaming from sensors
  liveGForce = 0;
  displayImpactG = 0;
  hasLiveTelemetry = false;
  impactPulseActive = false;
  /** Rolling display buffer for the live impact graph. */
  liveSamples: number[] = Array(28).fill(0);
  gyroscope: LiveGyroscope | null = null;
  acceleration: LiveAcceleration = { x: 0, y: 0, z: 0 };
  liveLocation: LiveLocation | null = null;
  motionPermission: PermissionState = 'unknown';
  locationPermission: PermissionState = 'unknown';
  isSharing = false;
  selectedShareReport: PotholeReport | null = null;
  sharePreviewUrl = '';

  private clusterSub?: Subscription;
  private rawReportsSub?: Subscription;
  private gForceSub?: Subscription;
  private gyroscopeSub?: Subscription;
  private accelerationSub?: Subscription;
  private locationSub?: Subscription;
  private permissionSub?: Subscription;
  private locationPermissionSub?: Subscription;
  private impactPulseTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly sensorDetection: SensorDetectionService,
    private readonly grievanceShare: GrievanceShareService,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.clusterSub = this.telemetryService.clusters$.subscribe((clusters) => {
      this.clusters = clusters;
    });

    this.rawReportsSub = this.telemetryService.rawReports$.subscribe((reports) => {
      this.rawReports = reports;
      this.totalHazardsCount = reports.length;
      this.alarmingCount = reports.filter((r) => r.severity === 'alarming').length;
      this.severeCount = reports.filter((r) => r.severity === 'severe').length;
      this.moderateCount = reports.filter((r) => r.severity === 'moderate').length;
      this.maxGForce = reports.reduce((max, r) => Math.max(max, r.gForce), 0);
    });

    this.gForceSub = this.sensorDetection.liveGForce$.subscribe((g) => {
      const wasImpactDetected = this.isImpactDetected;
      this.liveGForce = g;
      this.hasLiveTelemetry = true;
      this.displayImpactG = Math.max(0, g);
      this.liveSamples = [...this.liveSamples.slice(1), Math.min(this.displayImpactG, 5)];
      if (!wasImpactDetected && this.isImpactDetected) {
        this.triggerImpactPulse();
      }
    });
    this.gyroscopeSub = this.sensorDetection.liveGyroscope$.subscribe((gyroscope) => {
      this.gyroscope = gyroscope;
    });
    this.accelerationSub = this.sensorDetection.liveAcceleration$.subscribe((acceleration) => {
      this.acceleration = acceleration;
    });
    this.locationSub = this.sensorDetection.liveLocation$.subscribe((location) => {
      this.liveLocation = location;
    });
    this.permissionSub = this.sensorDetection.motionPermissionState$.subscribe((state) => {
      this.motionPermission = state;
    });
    this.locationPermissionSub = this.sensorDetection.locationPermissionState$.subscribe((state) => {
      this.locationPermission = state;
    });
    void this.sensorDetection.startListening();
    void this.sensorDetection.startLocationWatch();
    void this.sensorDetection.refreshLocationPermissionState();
  }

  ngOnDestroy(): void {
    this.clusterSub?.unsubscribe();
    this.rawReportsSub?.unsubscribe();
    this.gForceSub?.unsubscribe();
    this.gyroscopeSub?.unsubscribe();
    this.accelerationSub?.unsubscribe();
    this.locationSub?.unsubscribe();
    this.permissionSub?.unsubscribe();
    this.locationPermissionSub?.unsubscribe();
    if (this.impactPulseTimer) {
      clearTimeout(this.impactPulseTimer);
    }
  }

  get unsubmittedCount(): number {
    return this.rawReports.filter((r) => r.status !== 'submitted').length;
  }

  graphHeight(sample: number): number {
    return Math.max(5, Math.min(100, (sample / 5) * 100));
  }

  get isImpactDetected(): boolean {
    return this.liveGForce >= DISPLAY_ANOMALY_THRESHOLD_G;
  }

  get impactStatus(): string {
    if (!this.hasLiveTelemetry) {
      return 'Waiting for motion';
    }
    return this.isImpactDetected ? 'Anomaly detected' : 'Monitoring vibration';
  }

  private triggerImpactPulse(): void {
    this.impactPulseActive = true;
    if (this.impactPulseTimer) {
      clearTimeout(this.impactPulseTimer);
    }
    this.impactPulseTimer = setTimeout(() => {
      this.impactPulseActive = false;
      this.impactPulseTimer = undefined;
    }, 1200);
  }

  get locationStatus(): string {
    if (this.liveLocation) {
      return 'GPS fix active';
    }
    return this.locationPermission === 'denied' ? 'GPS access denied' : 'Acquiring GPS fix';
  }

  get needsMotionPermission(): boolean {
    return this.sensorDetection.needsMotionPermissionPrompt() && this.motionPermission !== 'granted';
  }

  async enableMotionSensing(): Promise<void> {
    if (await this.sensorDetection.requestMotionPermission()) {
      await this.sensorDetection.startListening();
    }
  }

  // Pull down the screen to reload / refresh
  async handleRefresh(event: any): Promise<void> {
    try {
      // Re-read or re-sync telemetry
      await new Promise((resolve) => setTimeout(resolve, 600));
      const toast = await this.toastCtrl.create({
        message: 'Road hazard zones refreshed',
        duration: 1800,
        position: 'bottom',
      });
      await toast.present();
    } finally {
      event.target.complete();
    }
  }

  toggleCluster(clusterId: string): void {
    if (this.expandedClusterIds.has(clusterId)) {
      this.expandedClusterIds.delete(clusterId);
    } else {
      this.expandedClusterIds.add(clusterId);
    }
  }

  isClusterExpanded(clusterId: string): boolean {
    return this.expandedClusterIds.has(clusterId);
  }

  openSeverityGuide(): void {
    // Moved to Settings page — no-op kept for backward compat
  }

  closeSeverityGuide(): void {
    // Moved to Settings page — no-op kept for backward compat
  }

  async shareGrievance(event: Event, report: PotholeReport): Promise<void> {
    event.stopPropagation();
    this.selectedShareReport = report;
    this.sharePreviewUrl = this.grievanceShare.getStaticMapUrl(report.latitude, report.longitude, 640, 360, 'satellite');
  }

  closeShareCard(): void {
    this.selectedShareReport = null;
    this.sharePreviewUrl = '';
  }

  async continueShare(): Promise<void> {
    if (!this.selectedShareReport) return;
    this.isSharing = true;

    try {
      await this.grievanceShare.shareGrievance(this.selectedShareReport);
      const toast = await this.toastCtrl.create({
        message: 'Grievance card ready for sharing and civic tagging',
        duration: 2500,
        position: 'bottom',
      });
      await toast.present();
    } catch (error) {
      console.warn('Grievance share failed', error);
    } finally {
      this.isSharing = false;
      this.closeShareCard();
    }
  }

  showOnMap(): void { void this.router.navigateByUrl('/map'); }

  exportRecords(format: 'json' | 'csv'): void {
    if (!this.rawReports.length) return;
    const fields = ['id', 'timestamp', 'latitude', 'longitude', 'severity', 'status', 'gForce'];
    const content = format === 'json'
      ? JSON.stringify(this.rawReports, null, 2)
      : [fields.join(','), ...this.rawReports.map((r) => fields.map((field) => JSON.stringify(r[field as keyof PotholeReport])).join(','))].join('\n');
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `bumpalert-telemetry-${new Date().toISOString().slice(0, 10)}.${format}`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  confirmReport(event: Event, id: string): void {
    event.stopPropagation();
    this.telemetryService.confirmReport(id);
  }

  dismissReport(event: Event, id: string): void {
    event.stopPropagation();
    this.telemetryService.dismissReport(id);
  }

  async submitCluster(cluster: TelemetryCluster): Promise<void> {
    const ids = cluster.reports.map((r) => r.id);
    this.telemetryService.markSubmitted(ids);

    const toast = await this.toastCtrl.create({
      message: `${ids.length} road hazards marked as submitted to agency portal`,
      duration: 3000,
      position: 'bottom',
    });
    await toast.present();
  }

  async submitAllHazards(): Promise<void> {
    const unsubmitted = this.rawReports.filter((r) => r.status !== 'submitted');
    if (unsubmitted.length === 0) return;

    const alert = await this.alertCtrl.create({
      header: 'Report All Road Hazards',
      message: `Submit all ${unsubmitted.length} geotagged impact detections to the civic highway agency (PWD / NHAI)?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Report All',
          handler: () => {
            this.telemetryService.markSubmitted(unsubmitted.map((r) => r.id));
          },
        },
      ],
    });
    await alert.present();
  }

  async clearAllData(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Clear All Telemetry',
      message: 'Remove all recorded impact detections and start fresh with 0 reports?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear All',
          role: 'destructive',
          handler: () => {
            this.telemetryService.clearAll();
            this.expandedClusterIds.clear();
            void this.toastCtrl.create({
              message: 'All telemetry records cleared. Ready for live ride sensing.',
              duration: 2500,
              position: 'bottom',
            }).then((t) => t.present());
          },
        },
      ],
    });
    await alert.present();
  }

  getDominantSeverityLabel(severity: HazardSeverity): string {
    switch (severity) {
      case 'alarming':
        return 'Alarming';
      case 'severe':
        return 'Severe';
      case 'moderate':
        return 'Moderate';
    }
  }
}
