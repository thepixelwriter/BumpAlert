/** Severity classification derived from the measured G-force spike. */
export type HazardSeverity = 'moderate' | 'severe' | 'alarming';

/** Lifecycle state of a detected event as it moves through the review flow. */
export type ReportStatus = 'pending' | 'confirmed' | 'dismissed' | 'submitted';

/** A single pothole/bump detection event captured by the accelerometer + GPS. */
export interface PotholeReport {
  id: string;
  latitude: number;
  longitude: number;
  /** Epoch milliseconds at the exact moment the spike was detected. */
  timestamp: number;
  /** Peak G-force recorded for this event. */
  gForce: number;
  severity: HazardSeverity;
  status: ReportStatus;
}

/** Geographic cluster of telemetry detections within 500 meters of each other. */
export interface TelemetryCluster {
  id: string;
  center: {
    latitude: number;
    longitude: number;
  };
  totalDetections: number;
  peakGForce: number;
  dominantSeverity: HazardSeverity;
  status: ReportStatus;
  earliestTimestamp: number;
  latestTimestamp: number;
  reports: PotholeReport[];
}

/** Outbound payload submitted to the civic agency (PWD/NHAI) backend. */
export interface HazardSubmissionPayload {
  submittedAt: number;
  hazards: Array<{
    latitude: number;
    longitude: number;
    timestamp: number;
    severity: HazardSeverity;
  }>;
}
