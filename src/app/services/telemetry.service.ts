import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { HazardSeverity, PotholeReport, ReportStatus, TelemetryCluster } from '../models/pothole-report.model';
import { SensorDetectionService } from './sensor-detection.service';
import { ReportStorageService } from './report-storage.service';

/** Spatial clustering threshold in meters. */
export const CLUSTER_DISTANCE_THRESHOLD_METERS = 500;

/** Severity threshold for the explicit Alarming tier. */
export const ALARMING_G_THRESHOLD = 4.0;
export const SEVERE_G_THRESHOLD = 2.2;
export const MODERATE_G_THRESHOLD = 1.8;

/**
 * Calculates great-circle distance between two coordinates using the Haversine formula.
 * @returns Ground distance in meters.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth's mean radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/** Initial telemetry sample dataset (Greater Noida route tracking). */
export const SEED_TELEMETRY_REPORTS: PotholeReport[] = [
  {
    id: '1787310128373-1881',
    latitude: 28.431765262323108,
    longitude: 77.50294085931131,
    timestamp: 1787310128373,
    gForce: 1.8812713623046873,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310173320-2013',
    latitude: 28.432836499791428,
    longitude: 77.50354319703348,
    timestamp: 1787310173320,
    gForce: 2.012802004814148,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310178037-2476',
    latitude: 28.432953066790795,
    longitude: 77.50378574810503,
    timestamp: 1787310178037,
    gForce: 2.4762419462203984,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310183237-2280',
    latitude: 28.43305201121333,
    longitude: 77.50401338606514,
    timestamp: 1787310183237,
    gForce: 2.28048712015152,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310214920-2411',
    latitude: 28.43284432656247,
    longitude: 77.50485048731063,
    timestamp: 1787310214920,
    gForce: 2.410659790039063,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310219954-1982',
    latitude: 28.43260285638951,
    longitude: 77.50497837242021,
    timestamp: 1787310219954,
    gForce: 1.9823606610298161,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310233003-2333',
    latitude: 28.432394420719177,
    longitude: 77.505331505048,
    timestamp: 1787310233003,
    gForce: 2.3326720595359802,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310315076-1990',
    latitude: 28.432398084871988,
    longitude: 77.50755809992003,
    timestamp: 1787310315076,
    gForce: 1.9901885390281677,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310317474-2936',
    latitude: 28.4323841740037,
    longitude: 77.50755508014858,
    timestamp: 1787310317474,
    gForce: 2.9361266791820526,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310319891-2287',
    latitude: 28.432381427156702,
    longitude: 77.5075497233055,
    timestamp: 1787310319891,
    gForce: 2.287490963935852,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310322275-3083',
    latitude: 28.43232143152297,
    longitude: 77.50752919901089,
    timestamp: 1787310322275,
    gForce: 3.08319091796875,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310324791-2803',
    latitude: 28.43232889202246,
    longitude: 77.50753152293498,
    timestamp: 1787310324791,
    gForce: 2.8032530546188354,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310335741-2064',
    latitude: 28.432296556789364,
    longitude: 77.50747530664697,
    timestamp: 1787310335741,
    gForce: 2.063751012086868,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310339642-2527',
    latitude: 28.432355560943783,
    longitude: 77.5075267697344,
    timestamp: 1787310339642,
    gForce: 2.5268400907516484,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310344975-1908',
    latitude: 28.432372021922824,
    longitude: 77.50760828371502,
    timestamp: 1787310344975,
    gForce: 1.9082335531711578,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310411108-2461',
    latitude: 28.43478111242683,
    longitude: 77.50624183433303,
    timestamp: 1787310411108,
    gForce: 2.4612883925437927,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310447407-2576',
    latitude: 28.438506587896462,
    longitude: 77.50406540857136,
    timestamp: 1787310447407,
    gForce: 2.5755155682563786,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310458824-3028',
    latitude: 28.43957758829991,
    longitude: 77.50345103986557,
    timestamp: 1787310458824,
    gForce: 3.0280761718750004,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310466641-2801',
    latitude: 28.44018291439252,
    longitude: 77.50309526630578,
    timestamp: 1787310466641,
    gForce: 2.8005980849266052,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310471391-2523',
    latitude: 28.44036389421539,
    longitude: 77.50299424270305,
    timestamp: 1787310471391,
    gForce: 2.522857487201691,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310477508-1940',
    latitude: 28.440794300306727,
    longitude: 77.50274459922358,
    timestamp: 1787310477508,
    gForce: 1.939575254917145,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310492941-2928',
    latitude: 28.44189090216467,
    longitude: 77.50209386222693,
    timestamp: 1787310492941,
    gForce: 2.92849737405777,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310500557-2064',
    latitude: 28.44251514608326,
    longitude: 77.50175316488384,
    timestamp: 1787310500557,
    gForce: 2.0643004775047302,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310508224-1932',
    latitude: 28.443129750541562,
    longitude: 77.50140090743892,
    timestamp: 1787310508224,
    gForce: 1.9324340820312502,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310510657-2176',
    latitude: 28.443294813130663,
    longitude: 77.50129237120122,
    timestamp: 1787310510657,
    gForce: 2.1761320829391475,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310519941-2511',
    latitude: 28.443807309438363,
    longitude: 77.50095402089003,
    timestamp: 1787310519941,
    gForce: 2.5114136338233948,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310526058-1908',
    latitude: 28.44417625059202,
    longitude: 77.50072401849015,
    timestamp: 1787310526058,
    gForce: 1.9075317382812502,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310530107-2028',
    latitude: 28.444361109338374,
    longitude: 77.50060902235226,
    timestamp: 1787310530107,
    gForce: 2.0282438993453975,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310534741-1930',
    latitude: 28.44456460665885,
    longitude: 77.50047631161988,
    timestamp: 1787310534741,
    gForce: 1.9301451444625852,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310604001-1957',
    latitude: 28.44536616405868,
    longitude: 77.49996775969488,
    timestamp: 1787310604001,
    gForce: 1.9571838378906252,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310606051-2493',
    latitude: 28.445578915412913,
    longitude: 77.49980333316756,
    timestamp: 1787310606051,
    gForce: 2.4932708144187927,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310610301-2393',
    latitude: 28.445850490466103,
    longitude: 77.49959334003508,
    timestamp: 1787310610301,
    gForce: 2.3928374648094177,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310612301-3086',
    latitude: 28.445987977990477,
    longitude: 77.49949645716569,
    timestamp: 1787310612301,
    gForce: 3.086364626884461,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310614834-9642',
    latitude: 28.446129661033975,
    longitude: 77.49939245463096,
    timestamp: 1787310614834,
    gForce: 9.641998410224913,
    severity: 'severe', // Will be reclassified to 'alarming' by ingestion logic (gForce >= 4.0)
    status: 'pending',
  },
  {
    id: '1787310618418-3769',
    latitude: 28.446419785386034,
    longitude: 77.4991474948548,
    timestamp: 1787310618418,
    gForce: 3.7694244980812077,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310620467-2003',
    latitude: 28.44655148011301,
    longitude: 77.4990547803247,
    timestamp: 1787310620467,
    gForce: 2.0030517578124996,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310623636-2155',
    latitude: 28.446636682436342,
    longitude: 77.49898382788821,
    timestamp: 1787310623636,
    gForce: 2.1551666259765625,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310673318-2350',
    latitude: 28.446918300687614,
    longitude: 77.49876964585975,
    timestamp: 1787310673318,
    gForce: 2.350356936454773,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310680834-2937',
    latitude: 28.44652003487043,
    longitude: 77.49910625483373,
    timestamp: 1787310680834,
    gForce: 2.9368896484375004,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310682885-2976',
    latitude: 28.446393694270988,
    longitude: 77.49917512845599,
    timestamp: 1787310682885,
    gForce: 2.9760742783546448,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310686434-2344',
    latitude: 28.446109631705376,
    longitude: 77.49943334531086,
    timestamp: 1787310686434,
    gForce: 2.3443604111671448,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310689301-2111',
    latitude: 28.44592923115334,
    longitude: 77.49955829496011,
    timestamp: 1787310689301,
    gForce: 2.1114960312843323,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310692351-2355',
    latitude: 28.445800259178213,
    longitude: 77.4996724964895,
    timestamp: 1787310692351,
    gForce: 2.3550111055374146,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310698884-2198',
    latitude: 28.44534363728804,
    longitude: 77.50000804160103,
    timestamp: 1787310698884,
    gForce: 2.198043763637543,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310706434-2410',
    latitude: 28.444623678566384,
    longitude: 77.5005191176129,
    timestamp: 1787310706434,
    gForce: 2.4103240668773656,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310711268-2507',
    latitude: 28.444349834243827,
    longitude: 77.5007110377373,
    timestamp: 1787310711268,
    gForce: 2.5066985487937927,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310715834-2011',
    latitude: 28.444182710445183,
    longitude: 77.50081161732628,
    timestamp: 1787310715834,
    gForce: 2.010879427194596,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310717951-2066',
    latitude: 28.444063344199304,
    longitude: 77.50086582739333,
    timestamp: 1787310717951,
    gForce: 2.065506100654602,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310720084-1933',
    latitude: 28.443886587574664,
    longitude: 77.50100608451416,
    timestamp: 1787310720084,
    gForce: 1.932662904262543,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310722650-2518',
    latitude: 28.44378285419175,
    longitude: 77.50107074547675,
    timestamp: 1787310722650,
    gForce: 2.51791387796402,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310736584-1864',
    latitude: 28.44262059496816,
    longitude: 77.50176514479185,
    timestamp: 1787310736584,
    gForce: 1.8641967475414274,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310745367-2705',
    latitude: 28.441983000718352,
    longitude: 77.50214189447371,
    timestamp: 1787310745367,
    gForce: 2.7047270536422734,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310770868-1826',
    latitude: 28.44022557396629,
    longitude: 77.50310570101975,
    timestamp: 1787310770868,
    gForce: 1.8258971869945528,
    severity: 'moderate',
    status: 'pending',
  },
  {
    id: '1787310773467-2649',
    latitude: 28.44001922649766,
    longitude: 77.50327058817868,
    timestamp: 1787310773467,
    gForce: 2.6492462158203125,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310794517-3094',
    latitude: 28.437365686255905,
    longitude: 77.50479913809592,
    timestamp: 1787310794517,
    gForce: 3.094009280204773,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310803451-2623',
    latitude: 28.436484095450506,
    longitude: 77.5052991596364,
    timestamp: 1787310803451,
    gForce: 2.6228026747703552,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310814517-2984',
    latitude: 28.435384008298435,
    longitude: 77.5059188177911,
    timestamp: 1787310814517,
    gForce: 2.9836730360984802,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310822051-2601',
    latitude: 28.43464459149661,
    longitude: 77.50634198201146,
    timestamp: 1787310822051,
    gForce: 2.6012726724147797,
    severity: 'severe',
    status: 'pending',
  },
  {
    id: '1787310954617-1853',
    latitude: 28.431074236662425,
    longitude: 77.50309812869574,
    timestamp: 1787310954617,
    gForce: 1.852920472621918,
    severity: 'moderate',
    status: 'pending',
  },
];

@Injectable({
  providedIn: 'root',
})
export class TelemetryService {
  private readonly rawReportsSubject = new BehaviorSubject<PotholeReport[]>([]);
  readonly rawReports$: Observable<PotholeReport[]> = this.rawReportsSubject.asObservable();

  /** True when the app is showing the built-in seed dataset instead of real ride data. */
  private readonly isDemoModeSubject = new BehaviorSubject<boolean>(false);
  readonly isDemoMode$: Observable<boolean> = this.isDemoModeSubject.asObservable();

  /** Observable stream of geographic clusters grouped by distance < 500m. */
  readonly clusters$: Observable<TelemetryCluster[]> = this.rawReports$.pipe(
    map((reports) => this.clusterTelemetry(reports, CLUSTER_DISTANCE_THRESHOLD_METERS)),
  );

  constructor(
    private readonly sensorDetection: SensorDetectionService,
    private readonly reportStorage: ReportStorageService,
  ) {
    this.initTelemetry();
  }

  private async initTelemetry(): Promise<void> {
    // 1. Load persisted reports first — prefer real data over seed
    const persisted = await this.reportStorage.loadAll();
    if (persisted.length > 0) {
      this.isDemoModeSubject.next(false);
      this.rawReportsSubject.next(this.ingestTelemetry(persisted));
    } else {
      // No real data yet — load seed dataset as a demo
      this.isDemoModeSubject.next(true);
      const seeded = this.ingestTelemetry(SEED_TELEMETRY_REPORTS);
      this.rawReportsSubject.next(seeded);
      // Do NOT persist seed data so the next real detection overwrites cleanly
    }

    // 2. Listen to live sensor reports — merge new detections on top of existing list
    this.sensorDetection.pendingReports$.subscribe((liveReports) => {
      if (liveReports.length === 0) return;

      // Once real data arrives, exit demo mode permanently
      if (this.isDemoModeSubject.value) {
        this.isDemoModeSubject.next(false);
        // Replace seed data with the first real detections
        const normalized = this.ingestTelemetry(liveReports);
        this.rawReportsSubject.next(normalized);
        void this.reportStorage.replaceAll(normalized);
        return;
      }

      // Merge live reports with existing, deduplicating by id
      const existingIds = new Set(this.rawReportsSubject.value.map((r) => r.id));
      const incoming = liveReports.filter((r) => !existingIds.has(r.id));
      if (incoming.length === 0) return;

      const merged = this.ingestTelemetry([...this.rawReportsSubject.value, ...incoming]);
      this.rawReportsSubject.next(merged);
      void this.reportStorage.replaceAll(merged);
    });
  }

  /**
   * Data Ingestion & Mapping Logic:
   * Normalizes incoming telemetry reports.
   * If gForce >= 4.0 Gs, automatically forces severity classification to 'alarming'.
   */
  ingestTelemetry(reports: PotholeReport[]): PotholeReport[] {
    return reports.map((report) => this.normalizeReport(report));
  }

  /**
   * Evaluates individual report and overrides severity to 'alarming' if gForce >= 4.0.
   */
  normalizeReport(report: PotholeReport): PotholeReport {
    let severity: HazardSeverity = report.severity;
    if (report.gForce >= ALARMING_G_THRESHOLD) {
      severity = 'alarming';
    } else if (report.gForce >= SEVERE_G_THRESHOLD) {
      severity = 'severe';
    } else if (report.gForce >= MODERATE_G_THRESHOLD) {
      severity = 'moderate';
    }

    return {
      ...report,
      severity,
    };
  }

  /**
   * Geoclustering Engine:
   * Groups individual telemetry reports into clusters where points are within radiusMeters (500m)
   * of the cluster's dynamic geographic center.
   * Computes the average center coordinate for each cluster.
   */
  clusterTelemetry(
    reports: PotholeReport[],
    radiusMeters: number = CLUSTER_DISTANCE_THRESHOLD_METERS,
  ): TelemetryCluster[] {
    if (!reports || reports.length === 0) {
      return [];
    }

    // Ingest and sort chronologically
    const normalized = this.ingestTelemetry(reports);
    const sorted = [...normalized].sort((a, b) => a.timestamp - b.timestamp);

    interface InternalCluster {
      id: string;
      reports: PotholeReport[];
      centerLat: number;
      centerLng: number;
    }

    const clusters: InternalCluster[] = [];

    for (const report of sorted) {
      let matchedCluster: InternalCluster | null = null;
      let minDistance = Infinity;

      for (const cluster of clusters) {
        const dist = haversineDistance(
          report.latitude,
          report.longitude,
          cluster.centerLat,
          cluster.centerLng,
        );

        if (dist < radiusMeters && dist < minDistance) {
          minDistance = dist;
          matchedCluster = cluster;
        }
      }

      if (matchedCluster) {
        matchedCluster.reports.push(report);
        // Recalculate average center coordinates
        const count = matchedCluster.reports.length;
        matchedCluster.centerLat =
          matchedCluster.reports.reduce((sum, r) => sum + r.latitude, 0) / count;
        matchedCluster.centerLng =
          matchedCluster.reports.reduce((sum, r) => sum + r.longitude, 0) / count;
      } else {
        clusters.push({
          id: `cluster-${clusters.length + 1}-${report.timestamp}`,
          reports: [report],
          centerLat: report.latitude,
          centerLng: report.longitude,
        });
      }
    }

    // Map internal clusters into TelemetryCluster models
    const result: TelemetryCluster[] = clusters.map((c, index) => {
      const peakGForce = Math.max(...c.reports.map((r) => r.gForce));
      const dominantSeverity = this.calculateDominantSeverity(c.reports);
      const status = this.calculateClusterStatus(c.reports);
      const timestamps = c.reports.map((r) => r.timestamp);
      const earliestTimestamp = Math.min(...timestamps);
      const latestTimestamp = Math.max(...timestamps);

      return {
        id: `Cluster #${index + 1} (${c.reports.length} detections)`,
        center: {
          latitude: c.centerLat,
          longitude: c.centerLng,
        },
        totalDetections: c.reports.length,
        peakGForce,
        dominantSeverity,
        status,
        earliestTimestamp,
        latestTimestamp,
        reports: [...c.reports].sort((a, b) => b.timestamp - a.timestamp),
      };
    });

    // Chronological order (newest cluster first for review UX)
    return result.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  }

  /**
   * Determines dominant severity tier with priority: alarming > severe > moderate.
   */
  private calculateDominantSeverity(reports: PotholeReport[]): HazardSeverity {
    if (reports.some((r) => r.severity === 'alarming')) {
      return 'alarming';
    }
    if (reports.some((r) => r.severity === 'severe')) {
      return 'severe';
    }
    return 'moderate';
  }

  /**
   * Determines cluster overall status.
   */
  private calculateClusterStatus(reports: PotholeReport[]): ReportStatus {
    if (reports.some((r) => r.status === 'pending')) {
      return 'pending';
    }
    if (reports.some((r) => r.status === 'confirmed')) {
      return 'confirmed';
    }
    if (reports.some((r) => r.status === 'submitted')) {
      return 'submitted';
    }
    return 'dismissed';
  }

  /**
   * Confirms an individual report.
   */
  confirmReport(id: string): void {
    this.sensorDetection.confirmReport(id);
    const updated = this.rawReportsSubject.value.map((r) =>
      r.id === id ? { ...r, status: 'confirmed' as const } : r,
    );
    this.rawReportsSubject.next(updated);
    void this.reportStorage.replaceAll(updated);
  }

  /**
   * Dismisses an individual report.
   */
  dismissReport(id: string): void {
    this.sensorDetection.dismissReport(id);
    const updated = this.rawReportsSubject.value.filter((r) => r.id !== id);
    this.rawReportsSubject.next(updated);
    void this.reportStorage.replaceAll(updated);
  }

  /**
   * Marks a set of reports as submitted to agency.
   */
  markSubmitted(ids: string[]): void {
    this.sensorDetection.markSubmitted(ids);
    const idSet = new Set(ids);
    const updated = this.rawReportsSubject.value.map((r) =>
      idSet.has(r.id) ? { ...r, status: 'submitted' as const } : r,
    );
    this.rawReportsSubject.next(updated);
    void this.reportStorage.replaceAll(updated);
  }

  /**
   * Resets and re-seeds the dataset with demo data.
   */
  resetToSeedData(): void {
    this.isDemoModeSubject.next(true);
    const seeded = this.ingestTelemetry(SEED_TELEMETRY_REPORTS);
    this.rawReportsSubject.next(seeded);
    void this.reportStorage.replaceAll(seeded);
  }

  /**
   * Clears all recorded telemetry and stored reports for a fresh start.
   */
  clearAll(): void {
    this.sensorDetection.clearAll();
    this.isDemoModeSubject.next(false);
    this.rawReportsSubject.next([]);
    void this.reportStorage.replaceAll([]);
  }
}

