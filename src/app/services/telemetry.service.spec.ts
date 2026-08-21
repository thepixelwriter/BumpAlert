import { TestBed } from '@angular/core/testing';
import {
  TelemetryService,
  haversineDistance,
  SEED_TELEMETRY_REPORTS,
} from './telemetry.service';
import { PotholeReport } from '../models/pothole-report.model';

describe('TelemetryService & Geoclustering Engine', () => {
  let service: TelemetryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TelemetryService);
  });

  describe('Haversine Distance Formula', () => {
    it('should return 0 meters for identical coordinates', () => {
      const dist = haversineDistance(28.43176, 77.50294, 28.43176, 77.50294);
      expect(dist).toBeCloseTo(0, 1);
    });

    it('should accurately calculate distance between close coordinates (<500m)', () => {
      // Coordinates ~130 meters apart in Greater Noida
      const dist = haversineDistance(28.431765, 77.502940, 28.432836, 77.503543);
      expect(dist).toBeGreaterThan(100);
      expect(dist).toBeLessThan(200);
    });
  });

  describe('Alarming Severity Classification', () => {
    it('should force severity to alarming when gForce >= 4.0', () => {
      const rawReport: PotholeReport = {
        id: 'test-1',
        latitude: 28.44612,
        longitude: 77.49939,
        timestamp: Date.now(),
        gForce: 9.64,
        severity: 'severe', // Should be overridden to alarming
        status: 'pending',
      };

      const normalized = service.normalizeReport(rawReport);
      expect(normalized.severity).toBe('alarming');
    });

    it('should preserve severe and moderate classifications when gForce < 4.0', () => {
      const severeReport: PotholeReport = {
        id: 'test-2',
        latitude: 28.44612,
        longitude: 77.49939,
        timestamp: Date.now(),
        gForce: 2.8,
        severity: 'severe',
        status: 'pending',
      };
      expect(service.normalizeReport(severeReport).severity).toBe('severe');

      const moderateReport: PotholeReport = {
        id: 'test-3',
        latitude: 28.44612,
        longitude: 77.49939,
        timestamp: Date.now(),
        gForce: 1.9,
        severity: 'moderate',
        status: 'pending',
      };
      expect(service.normalizeReport(moderateReport).severity).toBe('moderate');
    });
  });

  describe('Spatial Clustering (< 500 meters)', () => {
    it('should group nearby points within 500m into the same cluster', () => {
      const points: PotholeReport[] = [
        {
          id: 'p1',
          latitude: 28.43283,
          longitude: 77.50354,
          timestamp: 1000,
          gForce: 2.0,
          severity: 'moderate',
          status: 'pending',
        },
        {
          id: 'p2',
          latitude: 28.43295,
          longitude: 77.50378,
          timestamp: 2000,
          gForce: 2.5,
          severity: 'severe',
          status: 'pending',
        },
        {
          id: 'p3',
          latitude: 28.43305,
          longitude: 77.50401,
          timestamp: 3000,
          gForce: 2.3,
          severity: 'severe',
          status: 'pending',
        },
      ];

      const clusters = service.clusterTelemetry(points, 500);
      expect(clusters.length).toBe(1);
      expect(clusters[0].totalDetections).toBe(3);
      expect(clusters[0].peakGForce).toBe(2.5);
      expect(clusters[0].dominantSeverity).toBe('severe');

      // Average center coordinates should be between min and max
      expect(clusters[0].center.latitude).toBeCloseTo(
        (28.43283 + 28.43295 + 28.43305) / 3,
        4,
      );
      expect(clusters[0].center.longitude).toBeCloseTo(
        (77.50354 + 77.50378 + 77.50401) / 3,
        4,
      );
    });

    it('should correctly cluster the 38 attached telemetry records', () => {
      const clusters = service.clusterTelemetry(SEED_TELEMETRY_REPORTS, 500);
      expect(clusters.length).toBeGreaterThan(1);

      // Verify the alarming 9.64G record is clustered and flagged as alarming
      const alarmingCluster = clusters.find((c) => c.dominantSeverity === 'alarming');
      expect(alarmingCluster).toBeDefined();
      expect(alarmingCluster!.peakGForce).toBeCloseTo(9.64, 1);
    });
  });
});

