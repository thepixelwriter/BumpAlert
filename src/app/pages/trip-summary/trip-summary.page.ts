import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { SensorDetectionService } from '../../services/sensor-detection.service';
import { HazardSubmissionPayload, PotholeReport } from '../../models/pothole-report.model';

/** View-model wrapper pairing a captured report with its checkbox selection state. */
interface SelectableReport extends PotholeReport {
  selected: boolean;
}

@Component({
  selector: 'app-trip-summary',
  templateUrl: './trip-summary.page.html',
  styleUrls: ['./trip-summary.page.scss'],
  standalone: false,
})
export class TripSummaryPage implements OnInit, OnDestroy {
  reports: SelectableReport[] = [];
  private reportsSub?: Subscription;

  constructor(private readonly sensorDetection: SensorDetectionService) {}

  ngOnInit(): void {
    this.reportsSub = this.sensorDetection.pendingReports$.subscribe((reports) => {
      const previouslySelected = new Set(this.reports.filter((r) => r.selected).map((r) => r.id));
      this.reports = reports
        .filter((r) => r.status !== 'submitted')
        .map((r) => ({ ...r, selected: previouslySelected.has(r.id) }));
    });
  }

  ngOnDestroy(): void {
    this.reportsSub?.unsubscribe();
  }

  get selectedCount(): number {
    return this.reports.filter((r) => r.selected).length;
  }

  get allSelected(): boolean {
    return this.reports.length > 0 && this.selectedCount === this.reports.length;
  }

  toggleSelectAll(): void {
    const nextState = !this.allSelected;
    this.reports = this.reports.map((r) => ({ ...r, selected: nextState }));
  }

  toggleReport(id: string): void {
    this.reports = this.reports.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r));
  }

  async submitSelected(): Promise<void> {
    const selected = this.reports.filter((r) => r.selected);
    if (selected.length === 0) {
      return;
    }

    const payload: HazardSubmissionPayload = {
      submittedAt: Date.now(),
      hazards: selected.map((r) => ({
        latitude: r.latitude,
        longitude: r.longitude,
        timestamp: r.timestamp,
        severity: r.severity,
      })),
    };

    await this.submitToAgency(payload);
    this.sensorDetection.markSubmitted(selected.map((r) => r.id));
  }

  /** Placeholder for the actual PWD/NHAI agency API integration. */
  private async submitToAgency(payload: HazardSubmissionPayload): Promise<void> {
    console.log('Submitting hazards to civic agency:', payload);
  }
}
