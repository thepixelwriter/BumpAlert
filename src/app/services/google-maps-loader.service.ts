import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

declare global {
  interface Window {
    google?: typeof google;
  }
}

/** Lazily injects the Google Maps JS SDK script once and resolves when it's ready. */
@Injectable({
  providedIn: 'root',
})
export class GoogleMapsLoaderService {
  private loadPromise?: Promise<typeof google.maps>;

  load(): Promise<typeof google.maps> {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    if (!environment.googleMapsApiKey) {
      return Promise.reject(
        new Error('Missing googleMapsApiKey in environment.ts - see setup instructions.'),
      );
    }

    if (window.google?.maps) {
      this.loadPromise = Promise.resolve(window.google.maps);
      return this.loadPromise;
    }

    this.loadPromise = new Promise((resolve, reject) => {
      const callbackName = '__bumpAlertGoogleMapsReady';
      (window as unknown as Record<string, () => void>)[callbackName] = () => {
        if (window.google?.maps) {
          resolve(window.google.maps);
        } else {
          reject(new Error('Google Maps SDK loaded but window.google.maps is unavailable'));
        }
      };

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${environment.googleMapsApiKey}&libraries=places&callback=${callbackName}`;
      script.async = true;
      script.onerror = () => reject(new Error('Failed to load the Google Maps SDK script'));
      document.head.appendChild(script);
    });

    return this.loadPromise;
  }
}
