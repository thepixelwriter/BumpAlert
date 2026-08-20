import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { GeocodeResult, RouteResult } from '../models/map.model';
import { GoogleMapsLoaderService } from './google-maps-loader.service';

@Injectable({
  providedIn: 'root',
})
export class MapNavigationService implements OnDestroy {
  private watchId: string | null = null;

  private readonly currentPositionSubject = new BehaviorSubject<Position | null>(null);
  /** Latest known GPS fix, driving the map viewport and route progress. */
  readonly currentPosition$: Observable<Position | null> = this.currentPositionSubject.asObservable();

  constructor(private readonly googleMapsLoader: GoogleMapsLoaderService) {}

  async startTracking(): Promise<void> {
    if (this.watchId) {
      return;
    }
    this.watchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 10000 },
      (position, err) => {
        if (err) {
          console.warn('BumpAlert: navigation location watch error', err);
          return;
        }
        if (position) {
          this.currentPositionSubject.next(position);
        }
      },
    );
  }

  async stopTracking(): Promise<void> {
    if (this.watchId) {
      await Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }
  }

  async getCurrentPosition(): Promise<Position> {
    return Geolocation.getCurrentPosition({ enableHighAccuracy: true });
  }

  /** Looks up place suggestions for a free-text "from"/"to" query via Google Geocoding. */
  async geocodeAddress(query: string): Promise<GeocodeResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      return [];
    }

    const maps = await this.googleMapsLoader.load();
    const geocoder = new maps.Geocoder();

    return new Promise<GeocodeResult[]>((resolve, reject) => {
      geocoder.geocode({ address: trimmed }, (results, status) => {
        if (status !== 'OK' || !results) {
          if (status === 'ZERO_RESULTS') {
            resolve([]);
            return;
          }
          reject(new Error(`Geocoding failed with status ${status}`));
          return;
        }

        resolve(
          results.map((r) => ({
            label: r.formatted_address,
            latitude: r.geometry.location.lat(),
            longitude: r.geometry.location.lng(),
          })),
        );
      });
    });
  }

  /** Computes a driving route between two coordinates via Google Directions. */
  async getRoute(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
  ): Promise<RouteResult> {
    const maps = await this.googleMapsLoader.load();
    const directionsService = new maps.DirectionsService();

    return new Promise<RouteResult>((resolve, reject) => {
      directionsService.route(
        {
          origin: { lat: origin.latitude, lng: origin.longitude },
          destination: { lat: destination.latitude, lng: destination.longitude },
          travelMode: maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status !== 'OK' || !result) {
            reject(new Error(`Routing failed with status ${status}`));
            return;
          }

          const leg = result.routes[0]?.legs[0];
          if (!leg) {
            reject(new Error('No route found between the selected points'));
            return;
          }

          resolve({
            points: result.routes[0].overview_path.map((p) => ({
              latitude: p.lat(),
              longitude: p.lng(),
            })),
            distanceMeters: leg.distance?.value ?? 0,
            durationSeconds: leg.duration?.value ?? 0,
          });
        },
      );
    });
  }

  ngOnDestroy(): void {
    void this.stopTracking();
  }
}
