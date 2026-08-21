import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Wraps the Screen Wake Lock API so the display stays on while the app is actively
 * recording a ride. Browsers force-release the lock on tab/app backgrounding, so this
 * service re-acquires it automatically once the page becomes visible again.
 */
@Injectable({
  providedIn: 'root',
})
export class WakeLockService implements OnDestroy {
  readonly isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  private sentinel: WakeLockSentinel | null = null;
  /** Whether the caller currently wants a lock held - drives the visibilitychange re-acquire. */
  private wanted = false;

  private readonly activeSubject = new BehaviorSubject<boolean>(false);
  readonly active$: Observable<boolean> = this.activeSubject.asObservable();

  private readonly visibilityHandler = (): void => {
    if (document.visibilityState === 'visible' && this.wanted && !this.sentinel) {
      void this.acquire();
    }
  };

  constructor(private readonly zone: NgZone) {
    if (this.isSupported) {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  /** Requests the lock and remembers the intent so it's restored after a visibility drop. */
  async enable(): Promise<boolean> {
    this.wanted = true;
    return this.acquire();
  }

  async disable(): Promise<void> {
    this.wanted = false;
    await this.release();
  }

  get isActive(): boolean {
    return this.activeSubject.value;
  }

  private async acquire(): Promise<boolean> {
    if (!this.isSupported) {
      return false;
    }
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      this.sentinel = sentinel;
      this.activeSubject.next(true);
      sentinel.addEventListener('release', () => {
        // Fires both on explicit release() and on OS-driven revocation (screen off, tab hidden).
        this.zone.run(() => {
          this.sentinel = null;
          this.activeSubject.next(false);
        });
      });
      return true;
    } catch (error) {
      console.warn('BumpAlert: screen wake lock request failed', error);
      this.sentinel = null;
      this.activeSubject.next(false);
      return false;
    }
  }

  private async release(): Promise<void> {
    const current = this.sentinel;
    this.sentinel = null;
    if (current && !current.released) {
      try {
        await current.release();
      } catch (error) {
        console.warn('BumpAlert: screen wake lock release failed', error);
      }
    }
    this.activeSubject.next(false);
  }

  ngOnDestroy(): void {
    if (this.isSupported) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    void this.release();
  }
}
