import { WebPlugin } from '@capacitor/core';
import type { BackgroundBumpDetectionPlugin, BackgroundBumpReport } from './background-bump-detection';

/** No-op web/PWA fallback - the browser suspends JS entirely while backgrounded, so there's nothing to bridge to. */
export class BackgroundBumpDetectionWeb extends WebPlugin implements BackgroundBumpDetectionPlugin {
  async start(): Promise<void> {
    // Intentionally empty.
  }

  async stop(): Promise<void> {
    // Intentionally empty.
  }

  async drainReports(): Promise<{ reports: BackgroundBumpReport[] }> {
    return { reports: [] };
  }
}
