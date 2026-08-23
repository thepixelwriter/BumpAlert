import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { PotholeReport } from '../../models/pothole-report.model';
import { TelemetryService } from '../../services/telemetry.service';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: false,
})
export class HistoryPage implements OnInit, OnDestroy {
  reports: PotholeReport[] = [];
  private reportsSub?: Subscription;

  constructor(private readonly telemetryService: TelemetryService) {}

  ngOnInit(): void {
    this.reportsSub = this.telemetryService.rawReports$.subscribe((reports) => {
      this.reports = [...reports].sort((a, b) => b.timestamp - a.timestamp);
    });
  }

  ngOnDestroy(): void {
    this.reportsSub?.unsubscribe();
  }
}
