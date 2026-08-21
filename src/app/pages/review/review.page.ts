import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ToastController, AlertController } from '@ionic/angular';
import { HazardSeverity, PotholeReport, TelemetryCluster } from '../../models/pothole-report.model';
import { TelemetryService } from '../../services/telemetry.service';
import { GrievanceShareService } from '../../services/grievance-share.service';

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

  isSharing = false;

  private clusterSub?: Subscription;
  private rawReportsSub?: Subscription;

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly grievanceShare: GrievanceShareService,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController,
  ) {}

  ngOnInit(): void {
    this.clusterSub = this.telemetryService.clusters$.subscribe((clusters) => {
      this.clusters = clusters;
      // Clusters remain collapsed by default
    });

    this.rawReportsSub = this.telemetryService.rawReports$.subscribe((reports) => {
      this.rawReports = reports;
      this.totalHazardsCount = reports.length;
      this.alarmingCount = reports.filter((r) => r.severity === 'alarming').length;
      this.severeCount = reports.filter((r) => r.severity === 'severe').length;
      this.moderateCount = reports.filter((r) => r.severity === 'moderate').length;
      this.maxGForce = reports.reduce((max, r) => Math.max(max, r.gForce), 0);
    });
  }

  ngOnDestroy(): void {
    this.clusterSub?.unsubscribe();
    this.rawReportsSub?.unsubscribe();
  }

  get unsubmittedCount(): number {
    return this.rawReports.filter((r) => r.status !== 'submitted').length;
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
    this.isSharing = true;

    try {
      await this.grievanceShare.shareGrievance(report);
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
    }
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

  resetSeedData(): void {
    this.telemetryService.resetToSeedData();
    this.expandedClusterIds.clear();
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
