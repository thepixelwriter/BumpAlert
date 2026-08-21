import { Injectable } from '@angular/core';
import { PotholeReport } from '../models/pothole-report.model';

const DB_NAME = 'bumpalert-db';
const DB_VERSION = 1;
const STORE_NAME = 'pending-reports';

/**
 * Persists the in-flight detection queue to IndexedDB so a frozen/killed tab
 * (e.g. after the OS suspends the browser on screen-off) can resume a ride
 * without losing bumps captured before the interruption.
 */
@Injectable({
  providedIn: 'root',
})
export class ReportStorageService {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private openDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) {
      return this.dbPromise;
    }
    if (typeof indexedDB === 'undefined') {
      this.dbPromise = Promise.resolve(null);
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn('BumpAlert: failed to open IndexedDB', request.error);
        resolve(null);
      };
    });
    return this.dbPromise;
  }

  /** Reads every persisted report - used once on startup to auto-resume a ride. */
  async loadAll(): Promise<PotholeReport[]> {
    const db = await this.openDb();
    if (!db) {
      return [];
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as PotholeReport[]) ?? []);
      request.onerror = () => {
        console.warn('BumpAlert: failed to read persisted reports', request.error);
        resolve([]);
      };
    });
  }

  /** Full-replace sync - simplest way to keep IndexedDB consistent with the in-memory queue. */
  async replaceAll(reports: PotholeReport[]): Promise<void> {
    const db = await this.openDb();
    if (!db) {
      return;
    }
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const report of reports) {
        store.put(report);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.warn('BumpAlert: failed to persist reports', tx.error);
        resolve();
      };
    });
  }
}
