import { registerPlugin } from '@capacitor/core';
import { HazardSeverity } from '../models/pothole-report.model';

export interface BackgroundBumpReport {
  id: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  gForce: number;
  severity: HazardSeverity;
}

/**
 * Bridges to a native foreground service (Android only - see BumpDetectionService.java) that
 * keeps sampling the accelerometer + GPS while the app is minimized but not killed. Browsers and
 * iOS suspend this kind of background work entirely, so there is no equivalent on those platforms.
 */
export interface BackgroundBumpDetectionPlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Reads and clears whatever bumps the native service captured since the last drain. */
  drainReports(): Promise<{ reports: BackgroundBumpReport[] }>;
}

export const BackgroundBumpDetection = registerPlugin<BackgroundBumpDetectionPlugin>('BackgroundBumpDetection', {
  web: () => import('./background-bump-detection.web').then((m) => new m.BackgroundBumpDetectionWeb()),
});
