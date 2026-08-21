import { ApplicationRef, Injectable } from '@angular/core';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { AlertController } from '@ionic/angular';
import { concat, interval } from 'rxjs';
import { first } from 'rxjs/operators';

/** How often to re-check for a newly deployed version while the app stays open. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * The Angular service worker caches the app shell aggressively and only swaps in a new
 * version on its own schedule, so without this a deployed change can sit unseen on a
 * device until the PWA happens to restart at the right moment. This polls for updates
 * and prompts the user to reload as soon as one is ready.
 */
@Injectable({
  providedIn: 'root',
})
export class PwaUpdateService {
  constructor(
    private readonly appRef: ApplicationRef,
    private readonly swUpdate: SwUpdate,
    private readonly alertController: AlertController,
  ) {}

  init(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates.subscribe((event: VersionEvent) => {
      if (event.type === 'VERSION_READY') {
        void this.promptReload();
      } else if (event.type === 'VERSION_INSTALLATION_FAILED') {
        console.warn('BumpAlert: PWA update failed to install', event);
      }
    });

    this.swUpdate.unrecoverable.subscribe((event) => {
      console.warn('BumpAlert: service worker in an unrecoverable state', event);
      void this.promptHardReload();
    });

    // Check once the app is stable, then on an interval for as long as it stays open.
    const appIsStable$ = this.appRef.isStable.pipe(first((isStable) => isStable));
    concat(appIsStable$, interval(CHECK_INTERVAL_MS)).subscribe(() => {
      void this.swUpdate.checkForUpdate().catch((error) => {
        console.warn('BumpAlert: update check failed', error);
      });
    });
  }

  private async promptReload(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Update available',
      message: 'A new version of BumpAlert is ready. Reload now to get the latest fixes?',
      buttons: [
        { text: 'Later', role: 'cancel' },
        {
          text: 'Reload',
          handler: () => {
            void this.swUpdate.activateUpdate().then(() => document.location.reload());
          },
        },
      ],
    });
    await alert.present();
  }

  private async promptHardReload(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Update required',
      message: 'BumpAlert needs to reload to keep working correctly.',
      backdropDismiss: false,
      buttons: [{ text: 'Reload', handler: () => document.location.reload() }],
    });
    await alert.present();
  }
}
