import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { PotholeReport } from '../models/pothole-report.model';
import { SensorDetectionService } from './sensor-detection.service';
import { TelemetryService, haversineDistance } from './telemetry.service';

describe('TelemetryService current-session behavior', () => {
  let reportsSubject: BehaviorSubject<PotholeReport[]>;
  let sensor: jasmine.SpyObj<SensorDetectionService>;
  let service: TelemetryService;

  const report: PotholeReport = {
    id: 'real-1', latitude: 28.43283, longitude: 77.50354, timestamp: 1000,
    gForce: 2.5, severity: 'severe', status: 'pending',
  };

  beforeEach(() => {
    reportsSubject = new BehaviorSubject<PotholeReport[]>([]);
    sensor = jasmine.createSpyObj<SensorDetectionService>('SensorDetectionService',
      ['confirmReport', 'dismissReport', 'markSubmitted', 'clearAll'],
      { pendingReports$: reportsSubject.asObservable() });
    service = new TelemetryService(sensor);
  });

  it('starts with zero detections and never creates sample data', async () => {
    await expectAsync(firstValueFrom(service.rawReports$.pipe(take(1)))).toBeResolvedTo([]);
    await expectAsync(firstValueFrom(service.clusters$.pipe(take(1)))).toBeResolvedTo([]);
  });

  it('exposes only real telemetry reports received during the current session', async () => {
    reportsSubject.next([report]);
    await expectAsync(firstValueFrom(service.rawReports$.pipe(take(1)))).toBeResolvedTo([report]);
  });

  it('keeps export-ready records scoped to the current session and clears them on reset', async () => {
    reportsSubject.next([report]);
    expect(await firstValueFrom(service.rawReports$.pipe(take(1)))).toEqual([report]);
    service.clearAll();
    expect(sensor.clearAll).toHaveBeenCalled();
    reportsSubject.next([]);
    expect(await firstValueFrom(service.rawReports$.pipe(take(1)))).toEqual([]);
  });

  it('uses actual reports for individual sharing and review actions', () => {
    service.confirmReport(report.id);
    service.dismissReport(report.id);
    service.markSubmitted([report.id]);
    expect(sensor.confirmReport).toHaveBeenCalledWith(report.id);
    expect(sensor.dismissReport).toHaveBeenCalledWith(report.id);
    expect(sensor.markSubmitted).toHaveBeenCalledWith([report.id]);
  });

  it('clusters nearby real reports and classifies their severity', () => {
    const nearby = { ...report, id: 'real-2', timestamp: 2000, gForce: 4.1, severity: 'severe' as const };
    const clusters = service.clusterTelemetry([report, nearby]);
    expect(clusters).toHaveSize(1);
    expect(clusters[0].dominantSeverity).toBe('alarming');
  });

  it('calculates zero distance for identical positions', () => {
    expect(haversineDistance(28.43176, 77.50294, 28.43176, 77.50294)).toBeCloseTo(0, 1);
  });
});
