import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { HazardSeverity, PotholeReport, ReportStatus, TelemetryCluster } from '../models/pothole-report.model';
import { SensorDetectionService } from './sensor-detection.service';

export const CLUSTER_DISTANCE_THRESHOLD_METERS = 500;
export const ALARMING_G_THRESHOLD = 4.0;
export const SEVERE_G_THRESHOLD = 2.2;
export const MODERATE_G_THRESHOLD = 1.8;

/** Calculates great-circle distance between two coordinates in meters. */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private readonly rawReportsSubject = new BehaviorSubject<PotholeReport[]>([]);
  readonly rawReports$: Observable<PotholeReport[]> = this.rawReportsSubject.asObservable();

  readonly clusters$: Observable<TelemetryCluster[]> = this.rawReports$.pipe(
    map((reports) => this.clusterTelemetry(reports)),
  );

  constructor(private readonly sensorDetection: SensorDetectionService) {
    // Telemetry represents this in-memory ride session only.
    this.sensorDetection.pendingReports$.subscribe((reports) => {
      this.rawReportsSubject.next(this.ingestTelemetry(reports));
    });
  }

  ingestTelemetry(reports: PotholeReport[]): PotholeReport[] {
    return reports.map((report) => this.normalizeReport(report));
  }

  normalizeReport(report: PotholeReport): PotholeReport {
    let severity: HazardSeverity = report.severity;
    if (report.gForce >= ALARMING_G_THRESHOLD) severity = 'alarming';
    else if (report.gForce >= SEVERE_G_THRESHOLD) severity = 'severe';
    else if (report.gForce >= MODERATE_G_THRESHOLD) severity = 'moderate';
    return { ...report, severity };
  }

  clusterTelemetry(reports: PotholeReport[], radiusMeters = CLUSTER_DISTANCE_THRESHOLD_METERS): TelemetryCluster[] {
    if (!reports.length) return [];
    interface InternalCluster { reports: PotholeReport[]; centerLat: number; centerLng: number; }
    const clusters: InternalCluster[] = [];
    for (const report of [...this.ingestTelemetry(reports)].sort((a, b) => a.timestamp - b.timestamp)) {
      let match: InternalCluster | undefined;
      let minDistance = Infinity;
      for (const cluster of clusters) {
        const distance = haversineDistance(report.latitude, report.longitude, cluster.centerLat, cluster.centerLng);
        if (distance < radiusMeters && distance < minDistance) {
          match = cluster;
          minDistance = distance;
        }
      }
      if (!match) {
        clusters.push({ reports: [report], centerLat: report.latitude, centerLng: report.longitude });
        continue;
      }
      match.reports.push(report);
      const count = match.reports.length;
      match.centerLat = match.reports.reduce((sum, item) => sum + item.latitude, 0) / count;
      match.centerLng = match.reports.reduce((sum, item) => sum + item.longitude, 0) / count;
    }
    return clusters.map((cluster, index) => {
      const reportsInCluster = [...cluster.reports].sort((a, b) => b.timestamp - a.timestamp);
      const timestamps = reportsInCluster.map((report) => report.timestamp);
      return {
        id: `cluster-${index + 1}-${Math.min(...timestamps)}`,
        center: { latitude: cluster.centerLat, longitude: cluster.centerLng },
        totalDetections: reportsInCluster.length,
        peakGForce: Math.max(...reportsInCluster.map((report) => report.gForce)),
        dominantSeverity: this.calculateDominantSeverity(reportsInCluster),
        status: this.calculateClusterStatus(reportsInCluster),
        earliestTimestamp: Math.min(...timestamps),
        latestTimestamp: Math.max(...timestamps),
        reports: reportsInCluster,
      };
    }).sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  }

  confirmReport(id: string): void { this.sensorDetection.confirmReport(id); }
  dismissReport(id: string): void { this.sensorDetection.dismissReport(id); }
  markSubmitted(ids: string[]): void { this.sensorDetection.markSubmitted(ids); }

  /** Ends the current local session and returns the UI to its empty state. */
  clearAll(): void { this.sensorDetection.clearAll(); }

  private calculateDominantSeverity(reports: PotholeReport[]): HazardSeverity {
    if (reports.some((report) => report.severity === 'alarming')) return 'alarming';
    if (reports.some((report) => report.severity === 'severe')) return 'severe';
    return 'moderate';
  }

  private calculateClusterStatus(reports: PotholeReport[]): ReportStatus {
    if (reports.some((report) => report.status === 'pending')) return 'pending';
    if (reports.some((report) => report.status === 'confirmed')) return 'confirmed';
    if (reports.some((report) => report.status === 'submitted')) return 'submitted';
    return 'dismissed';
  }
}
