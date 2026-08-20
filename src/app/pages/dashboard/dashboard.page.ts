import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject, Subscription, firstValueFrom, of, timer } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { SensorDetectionService } from '../../services/sensor-detection.service';
import { MapNavigationService } from '../../services/map-navigation.service';
import { GoogleMapsLoaderService } from '../../services/google-maps-loader.service';
import { PotholeReport } from '../../models/pothole-report.model';
import { GeocodeResult } from '../../models/map.model';

/** Total time the alert card stays visible before auto-dismissing. */
const ALERT_DURATION_MS = 5000;
const ALERT_TICK_MS = 100;

/** Fallback map center (New Delhi) used until the first GPS fix arrives. */
const DEFAULT_CENTER = { lat: 28.6139, lng: 77.209 };
const DEFAULT_ZOOM = 16;
const SEARCH_DEBOUNCE_MS = 400;

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class DashboardPage implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainerRef!: ElementRef<HTMLDivElement>;

  /** Active alert being shown in the bottom card, or null when hidden. */
  activeAlert: PotholeReport | null = null;
  /** 0 -> 1 progress value bound to <ion-progress-bar>. */
  alertProgress = 0;

  pendingReportCount = 0;
  mapLoadError: string | null = null;

  /** Whether the Google-Maps-style from/to search panel is expanded. */
  searchPanelOpen = false;
  fromText = '';
  toText = '';
  fromResults: GeocodeResult[] = [];
  toResults: GeocodeResult[] = [];
  selectedFrom: GeocodeResult | null = null;
  selectedTo: GeocodeResult | null = null;
  routingInProgress = false;
  routingError: string | null = null;
  navigating = false;
  routeSummary: { distanceKm: string; durationMin: string } | null = null;

  private map?: google.maps.Map;
  private currentLocationMarker?: google.maps.Marker;
  private originMarker?: google.maps.Marker;
  private destinationMarker?: google.maps.Marker;
  private routeLine?: google.maps.Polyline;
  private lastKnownPosition: { latitude: number; longitude: number } | null = null;
  private readonly hazardMarkers = new Map<string, google.maps.Marker>();

  private readonly fromQuery$ = new Subject<string>();
  private readonly toQuery$ = new Subject<string>();

  private detectionSub?: Subscription;
  private pendingSub?: Subscription;
  private countdownSub?: Subscription;
  private positionSub?: Subscription;
  private fromSearchSub?: Subscription;
  private toSearchSub?: Subscription;

  constructor(
    private readonly sensorDetection: SensorDetectionService,
    private readonly mapNavigation: MapNavigationService,
    private readonly googleMapsLoader: GoogleMapsLoaderService,
    private readonly router: Router,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.initMap();

    this.pendingSub = this.sensorDetection.pendingReports$.subscribe((reports) => {
      this.pendingReportCount = reports.filter((r) => r.status === 'pending').length;
      this.syncHazardMarkers(reports);
    });

    this.detectionSub = this.sensorDetection.potholeDetected$.subscribe((report) => {
      this.showAlert(report);
    });

    this.positionSub = this.mapNavigation.currentPosition$.subscribe((position) => {
      if (!position) {
        return;
      }
      this.lastKnownPosition = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      this.updateCurrentLocation(position.coords.latitude, position.coords.longitude);
    });

    this.fromSearchSub = this.fromQuery$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((query) => this.safeGeocode(query)),
      )
      .subscribe((results) => (this.fromResults = results));

    this.toSearchSub = this.toQuery$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((query) => this.safeGeocode(query)),
      )
      .subscribe((results) => (this.toResults = results));

    await this.mapNavigation.startTracking();
    await this.sensorDetection.startListening();
  }

  /** Ionic keeps the page in the DOM while hidden, so the map needs a resize nudge on (re)entry. */
  ionViewDidEnter(): void {
    setTimeout(() => {
      if (this.map) {
        google.maps.event.trigger(this.map, 'resize');
      }
    }, 100);
  }

  async ngOnDestroy(): Promise<void> {
    this.detectionSub?.unsubscribe();
    this.pendingSub?.unsubscribe();
    this.countdownSub?.unsubscribe();
    this.positionSub?.unsubscribe();
    this.fromSearchSub?.unsubscribe();
    this.toSearchSub?.unsubscribe();
    await this.sensorDetection.stopListening();
    await this.mapNavigation.stopTracking();
  }

  private async initMap(): Promise<void> {
    try {
      const maps = await this.googleMapsLoader.load();
      this.map = new maps.Map(this.mapContainerRef.nativeElement, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        disableDefaultUI: true,
        zoomControl: false,
      });
    } catch (error) {
      console.error('BumpAlert: failed to load Google Maps', error);
      this.mapLoadError =
        'Map failed to load. Check that a valid Google Maps API key is configured (see environment.ts).';
    }
  }

  private updateCurrentLocation(latitude: number, longitude: number): void {
    if (!this.map) {
      return;
    }
    const position = { lat: latitude, lng: longitude };

    if (!this.currentLocationMarker) {
      this.currentLocationMarker = new google.maps.Marker({
        position,
        map: this.map,
        icon: this.buildDotIcon('#3880ff'),
        zIndex: 10,
      });
      this.map.setCenter(position);
    } else {
      this.currentLocationMarker.setPosition(position);
    }
  }

  private syncHazardMarkers(reports: PotholeReport[]): void {
    if (!this.map) {
      return;
    }
    const activeIds = new Set(reports.map((r) => r.id));

    // Remove markers for reports no longer in the queue (dismissed/submitted).
    for (const [id, marker] of this.hazardMarkers) {
      if (!activeIds.has(id)) {
        marker.setMap(null);
        this.hazardMarkers.delete(id);
      }
    }

    for (const report of reports) {
      if (this.hazardMarkers.has(report.id)) {
        continue;
      }
      const color = report.severity === 'severe' ? '#eb445a' : '#ffc409';
      const marker = new google.maps.Marker({
        position: { lat: report.latitude, lng: report.longitude },
        map: this.map,
        icon: this.buildDotIcon(color),
        title: `${report.severity === 'severe' ? 'Severe' : 'Moderate'} bump \u00b7 ${report.gForce.toFixed(2)}g`,
      });
      this.hazardMarkers.set(report.id, marker);
    }
  }

  private buildDotIcon(color: string): google.maps.Symbol {
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 7,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    };
  }

  private buildPinIcon(color: string): google.maps.Symbol {
    return {
      path: 'M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z',
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 1.5,
      scale: 1.3,
      anchor: new google.maps.Point(12, 22),
    };
  }

  private showAlert(report: PotholeReport): void {
    this.countdownSub?.unsubscribe();
    this.activeAlert = report;
    this.alertProgress = 0;

    const ticks = ALERT_DURATION_MS / ALERT_TICK_MS;
    this.countdownSub = timer(0, ALERT_TICK_MS).subscribe((tick) => {
      this.alertProgress = Math.min(tick / ticks, 1);
      if (tick >= ticks) {
        this.onTimeout();
      }
    });
  }

  /** User confirms the bump instantly - keep the event as a high-priority pending report. */
  quickReport(): void {
    if (!this.activeAlert) {
      return;
    }
    this.sensorDetection.confirmReport(this.activeAlert.id);
    this.closeAlert();
  }

  /** User marks the detection as a false positive and removes it from the queue. */
  dismiss(): void {
    if (!this.activeAlert) {
      return;
    }
    this.sensorDetection.dismissReport(this.activeAlert.id);
    this.closeAlert();
  }

  /** Timer expired with no interaction: hide the card, event stays queued silently. */
  private onTimeout(): void {
    this.closeAlert();
  }

  private closeAlert(): void {
    this.countdownSub?.unsubscribe();
    this.activeAlert = null;
    this.alertProgress = 0;
  }

  goToTripSummary(): void {
    void this.router.navigateByUrl('/tabs/trip-summary');
  }

  /** Floating "locate me" button - re-centers the map on a fresh GPS fix. */
  async locateMe(): Promise<void> {
    try {
      const position = await this.mapNavigation.getCurrentPosition();
      this.lastKnownPosition = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      this.updateCurrentLocation(position.coords.latitude, position.coords.longitude);
      this.map?.setCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
      this.map?.setZoom(DEFAULT_ZOOM);
    } catch (error) {
      console.warn('BumpAlert: unable to fetch current location', error);
      this.routingError = this.describeLocationError(error);
    }
  }

  toggleSearchPanel(): void {
    this.searchPanelOpen = !this.searchPanelOpen;
  }

  onFromInput(value: string): void {
    this.fromText = value;
    this.selectedFrom = null;
    this.fromQuery$.next(value);
  }

  onToInput(value: string): void {
    this.toText = value;
    this.selectedTo = null;
    this.toQuery$.next(value);
  }

  selectFrom(result: GeocodeResult): void {
    this.selectedFrom = result;
    this.fromText = result.label;
    this.fromResults = [];
  }

  selectTo(result: GeocodeResult): void {
    this.selectedTo = result;
    this.toText = result.label;
    this.toResults = [];
  }

  /** Resolves "From" to the picked suggestion, or falls back to the current GPS fix. */
  private async resolveOrigin(): Promise<{ latitude: number; longitude: number } | null> {
    if (this.selectedFrom) {
      return this.selectedFrom;
    }
    if (this.lastKnownPosition) {
      return this.lastKnownPosition;
    }
    try {
      const position = await this.mapNavigation.getCurrentPosition();
      return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    } catch {
      return null;
    }
  }

  /** Turns a raw Geolocation error into an actionable message for the user. */
  private describeLocationError(error: unknown): string {
    const code = (error as { code?: number } | null)?.code;
    if (code === 1) {
      return 'Location permission denied. Enable it in Safari > Website Settings > Location, and in iPhone Settings > Privacy > Location Services.';
    }
    if (code === 3) {
      return 'Location request timed out. Make sure Location Services is on and you have a clear GPS signal.';
    }
    return 'Unable to determine your current location. Check Location Services permissions and try again.';
  }

  async startNavigation(): Promise<void> {
    this.routingError = null;

    if (!this.selectedTo) {
      this.routingError = 'Pick a destination from the suggestions list.';
      return;
    }

    const origin = await this.resolveOrigin();
    if (!origin) {
      this.routingError = this.describeLocationError(null);
      return;
    }

    this.routingInProgress = true;
    try {
      const route = await this.mapNavigation.getRoute(origin, this.selectedTo);
      this.drawRoute(origin, this.selectedTo, route.points);
      this.routeSummary = {
        distanceKm: (route.distanceMeters / 1000).toFixed(1),
        durationMin: Math.round(route.durationSeconds / 60).toString(),
      };
      this.navigating = true;
      this.searchPanelOpen = false;
    } catch (error) {
      console.warn('BumpAlert: routing failed', error);
      this.routingError = 'Could not compute a route. Try again.';
    } finally {
      this.routingInProgress = false;
    }
  }

  private drawRoute(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    points: Array<{ latitude: number; longitude: number }>,
  ): void {
    if (!this.map) {
      return;
    }

    this.clearRoute();

    const path = points.map((p) => ({ lat: p.latitude, lng: p.longitude }));
    this.routeLine = new google.maps.Polyline({
      path,
      map: this.map,
      strokeColor: '#3880ff',
      strokeWeight: 5,
    });
    this.originMarker = new google.maps.Marker({
      position: { lat: origin.latitude, lng: origin.longitude },
      map: this.map,
      icon: this.buildPinIcon('#2dd36f'),
    });
    this.destinationMarker = new google.maps.Marker({
      position: { lat: destination.latitude, lng: destination.longitude },
      map: this.map,
      icon: this.buildPinIcon('#eb445a'),
    });

    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    this.map.fitBounds(bounds, 40);
  }

  private clearRoute(): void {
    this.routeLine?.setMap(null);
    this.originMarker?.setMap(null);
    this.destinationMarker?.setMap(null);
    this.routeLine = undefined;
    this.originMarker = undefined;
    this.destinationMarker = undefined;
  }

  stopNavigation(): void {
    this.clearRoute();
    this.navigating = false;
    this.routeSummary = null;
    this.selectedFrom = null;
    this.selectedTo = null;
    this.fromText = '';
    this.toText = '';
    this.routingError = null;
  }

  private async safeGeocode(query: string): Promise<GeocodeResult[]> {
    return firstValueFrom(
      of(query).pipe(
        switchMap((q) => this.mapNavigation.geocodeAddress(q)),
        catchError((error) => {
          console.warn('BumpAlert: geocoding failed', error);
          return of<GeocodeResult[]>([]);
        }),
      ),
      { defaultValue: [] },
    );
  }
}
