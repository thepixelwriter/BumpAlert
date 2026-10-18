import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { GeocodeResult, RouteResult, RouteStep } from '../models/map.model';
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

  /** Looks up destination suggestions with Google Places, falling back to Geocoding if unavailable. */
  async geocodeAddress(query: string): Promise<GeocodeResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      return [];
    }

    const maps = await this.googleMapsLoader.load();
    if (maps.places?.AutocompleteService) {
      const autocomplete = new maps.places.AutocompleteService();
      const predictions = await new Promise<google.maps.places.AutocompletePrediction[]>((resolve, reject) => {
        autocomplete.getPlacePredictions({ input: trimmed }, (results, status) => {
          if (status === maps.places.PlacesServiceStatus.ZERO_RESULTS) return resolve([]);
          if (status !== maps.places.PlacesServiceStatus.OK || !results) return reject(new Error(`Place search failed with status ${status}`));
          resolve(results);
        });
      });
      return Promise.all(
        predictions
          .filter((prediction) => Boolean(prediction.place_id))
          .slice(0, 5)
          .map((prediction) => this.resolvePlace(prediction.place_id, prediction.description)),
      );
    }

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

  private async resolvePlace(placeId: string, label: string): Promise<GeocodeResult> {
    const maps = await this.googleMapsLoader.load();
    const geocoder = new maps.Geocoder();
    return new Promise<GeocodeResult>((resolve, reject) => {
      geocoder.geocode({ placeId }, (results, status) => {
        const result = results?.[0];
        if (status !== 'OK' || !result) return reject(new Error(`Place details failed with status ${status}`));
        resolve({
          label,
          latitude: result.geometry.location.lat(),
          longitude: result.geometry.location.lng(),
          placeId,
        });
      });
    });
  }

  /** Computes a driving route between two coordinates via Google Directions. */
  async getRoutes(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
  ): Promise<RouteResult[]> {
    const maps = await this.googleMapsLoader.load();
    const directionsService = new maps.DirectionsService();

    return new Promise<RouteResult[]>((resolve, reject) => {
      directionsService.route(
        {
          origin: { lat: origin.latitude, lng: origin.longitude },
          destination: { lat: destination.latitude, lng: destination.longitude },
          travelMode: maps.TravelMode.DRIVING,
          provideRouteAlternatives: true,
          unitSystem: maps.UnitSystem.METRIC,
        },
        (result, status) => {
          if (status !== 'OK' || !result) {
            reject(new Error(`Routing failed with status ${status}`));
            return;
          }

          const routes = result.routes
            .map((route): RouteResult | null => {
              const leg = route.legs[0];
              if (!leg) return null;

              const steps: RouteStep[] = leg.steps.map((step) => ({
                instruction: this.cleanInstruction(step.instructions),
                maneuver: step.maneuver ?? '',
                distanceMeters: step.distance?.value ?? 0,
                durationSeconds: step.duration?.value ?? 0,
                start: { latitude: step.start_location.lat(), longitude: step.start_location.lng() },
                end: { latitude: step.end_location.lat(), longitude: step.end_location.lng() },
              }));

              return {
                summary: route.summary || 'Suggested route',
                points: route.overview_path.map((point) => ({
                  latitude: point.lat(),
                  longitude: point.lng(),
                })),
                distanceMeters: leg.distance?.value ?? 0,
                durationSeconds: leg.duration?.value ?? 0,
                steps,
              };
            })
            .filter((route): route is RouteResult => route !== null);

          if (routes.length === 0) {
            reject(new Error('No route found between the selected points'));
            return;
          }

          resolve(routes);
        },
      );
    });
  }

  /** Keeps existing callers on the original single-best-route API. */
  async getRoute(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
  ): Promise<RouteResult> {
    const [route] = await this.getRoutes(origin, destination);
    if (!route) {
      throw new Error('No route found between the selected points');
    }
    return route;
  }

  private cleanInstruction(instruction: string): string {
    return instruction
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  ngOnDestroy(): void {
    void this.stopTracking();
  }
}
