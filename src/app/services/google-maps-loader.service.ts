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

    if (
      !environment.googleMapsApiKey ||
      environment.googleMapsApiKey === 'YOUR_GOOGLE_MAPS_API_KEY'
    ) {
      return Promise.reject(
        new Error(
          'Google Maps API key is not configured. Please set GOOGLE_MAPS_API_KEY in your .env or CI environment.',
        ),
      );
    }

    if (window.google?.maps) {
      this.loadPromise = Promise.resolve(window.google.maps);
      return this.loadPromise;
    }

    this.loadPromise = new Promise((resolve, reject) => {
      // Global Google Maps authentication failure hook
      (window as unknown as Record<string, () => void>)['gm_authFailure'] = () => {
        console.error(
          'Google Maps Authentication Error: The API key was rejected by Google. Verify that billing is active, required APIs are enabled (Maps JavaScript, Geocoding, Directions, Places), and HTTP referrer restrictions allow this domain.',
        );
      };

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
