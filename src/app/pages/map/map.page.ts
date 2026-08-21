import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject, Subscription, firstValueFrom, of, timer } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { ToastController } from '@ionic/angular';
import { SensorDetectionService, LiveAcceleration, LiveLocation } from '../../services/sensor-detection.service';
import { MapNavigationService } from '../../services/map-navigation.service';
import { GoogleMapsLoaderService } from '../../services/google-maps-loader.service';
import { TelemetryService, haversineDistance } from '../../services/telemetry.service';
import { WakeLockService } from '../../services/wake-lock.service';
import { PotholeReport, HazardSeverity } from '../../models/pothole-report.model';
import { GeocodeResult } from '../../models/map.model';

const ALERT_DURATION_MS = 5000;
const ALERT_TICK_MS = 100;
const DEFAULT_CENTER = { latitude: 28.4328, longitude: 77.5035 };
const DEFAULT_ZOOM = 16;
const SEARCH_DEBOUNCE_MS = 400;

export interface NearestHazardInfo {
  distanceMeters: number;
  report: PotholeReport;
}

@Component({
  selector: 'app-map',
  templateUrl: './map.page.html',
  styleUrls: ['./map.page.scss'],
  standalone: false,
})
export class MapPage implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainerRef!: ElementRef<HTMLDivElement>;

  // Real-time sensor metrics
  currentGForce = 0;
  liveAcceleration: LiveAcceleration = { x: 0, y: 0, z: 0 };
  liveLocation: LiveLocation | null = null;
  isRideActive = false;

  // Nearest Pothole Alert HUD
  nearestHazard: NearestHazardInfo | null = null;

  // Active bump detection alert modal/toast
  activeAlert: PotholeReport | null = null;
  alertProgress = 0;

  // Navigation and Route Planner
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

  mapLoadError: string | null = null;
  private map?: google.maps.Map;
  private currentLocationMarker?: google.maps.Marker;
  private originMarker?: google.maps.Marker;
  private destinationMarker?: google.maps.Marker;
  private routeLine?: google.maps.Polyline;
  private lastKnownPosition: { latitude: number; longitude: number } | null = null;
  private readonly hazardMarkers = new Map<string, google.maps.Marker>();
  private allReports: PotholeReport[] = [];

  private readonly fromQuery$ = new Subject<string>();
  private readonly toQuery$ = new Subject<string>();

  private gForceSub?: Subscription;
  private accelSub?: Subscription;
  private detectSub?: Subscription;
  private reportsSub?: Subscription;
  private positionSub?: Subscription;
  private countdownSub?: Subscription;
  private fromSearchSub?: Subscription;
  private toSearchSub?: Subscription;

  constructor(
    private readonly sensorDetection: SensorDetectionService,
    private readonly mapNavigation: MapNavigationService,
    private readonly googleMapsLoader: GoogleMapsLoaderService,
    private readonly telemetryService: TelemetryService,
    private readonly wakeLock: WakeLockService,
    private readonly toastCtrl: ToastController,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.initMap();

    // 1. Live G-force stream for glassmorphism HUD meter
    this.gForceSub = this.sensorDetection.liveGForce$.subscribe((gForce) => {
      this.currentGForce = gForce;
    });

    this.accelSub = this.sensorDetection.liveAcceleration$.subscribe((axes) => {
      this.liveAcceleration = axes;
    });

    // 2. Real-time bump detection notifications
    this.detectSub = this.sensorDetection.potholeDetected$.subscribe((report) => {
      this.showAlert(report);
    });

    // 3. Telemetry reports subscription to render map markers and nearest hazard calculation
    this.reportsSub = this.telemetryService.rawReports$.subscribe((reports) => {
      this.allReports = reports;
      this.syncHazardMarkers(reports);
      this.updateNearestHazard();
    });

    // 4. GPS Position tracking for user marker & hazard proximity
    this.positionSub = this.mapNavigation.currentPosition$.subscribe((position) => {
      if (!position) return;
      this.lastKnownPosition = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      this.liveLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      this.updateCurrentLocation(position.coords.latitude, position.coords.longitude);
      this.updateNearestHazard();
    });

    // 5. Search autocomplete streams
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
    await this.startRide();
  }

  ionViewDidEnter(): void {
    setTimeout(() => {
      if (this.map) {
        google.maps.event.trigger(this.map, 'resize');
        if (this.lastKnownPosition) {
          this.map.setCenter({
            lat: this.lastKnownPosition.latitude,
            lng: this.lastKnownPosition.longitude,
          });
        }
      }
    }, 150);
  }

  async ngOnDestroy(): Promise<void> {
    this.gForceSub?.unsubscribe();
    this.accelSub?.unsubscribe();
    this.detectSub?.unsubscribe();
    this.reportsSub?.unsubscribe();
    this.positionSub?.unsubscribe();
    this.countdownSub?.unsubscribe();
    this.fromSearchSub?.unsubscribe();
    this.toSearchSub?.unsubscribe();
    await this.stopRide();
    await this.mapNavigation.stopTracking();
  }

  private async initMap(): Promise<void> {
    try {
      const maps = await this.googleMapsLoader.load();
      this.map = new maps.Map(this.mapContainerRef.nativeElement, {
        center: { lat: DEFAULT_CENTER.latitude, lng: DEFAULT_CENTER.longitude },
        zoom: DEFAULT_ZOOM,
        disableDefaultUI: true,
        zoomControl: false,
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#0e131b' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#0e131b' }, { weight: 2 }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#7e8c9f' }] },
          {
            featureType: 'administrative.locality',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#94a3b8' }],
          },
          {
            featureType: 'poi',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#475569' }],
          },
          {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{ color: '#1a2332' }],
          },
          {
            featureType: 'road',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#121822' }],
          },
          {
            featureType: 'road',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#64748b' }],
          },
          {
            featureType: 'road.highway',
            elementType: 'geometry',
            stylers: [{ color: '#253347' }],
          },
          {
            featureType: 'road.highway',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#17202d' }],
          },
          {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#090e15' }],
          },
          {
            featureType: 'water',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#334155' }],
          },
        ],
      });
    } catch (error) {
      console.error('BumpAlert: map initialization failed', error);
      this.mapLoadError = 'Map failed to load. Check API key configuration.';
    }
  }

  async toggleRide(): Promise<void> {
    if (this.isRideActive) {
      await this.stopRide();
    } else {
      await this.startRide();
    }
  }

  async startRide(): Promise<void> {
    try {
      await this.sensorDetection.startListening();
      await this.wakeLock.enable();
      this.isRideActive = true;
    } catch (err) {
      console.warn('Failed to start ride sensing', err);
    }
  }

  async stopRide(): Promise<void> {
    await this.sensorDetection.stopListening();
    await this.wakeLock.disable();
    this.isRideActive = false;
  }

  private updateCurrentLocation(latitude: number, longitude: number): void {
    if (!this.map) return;
    const position = { lat: latitude, lng: longitude };

    if (!this.currentLocationMarker) {
      this.currentLocationMarker = new google.maps.Marker({
        position,
        map: this.map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#38bdf8',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        zIndex: 100,
        title: 'Your Location',
      });
      this.map.setCenter(position);
    } else {
      this.currentLocationMarker.setPosition(position);
    }
  }

  private syncHazardMarkers(reports: PotholeReport[]): void {
    if (!this.map) return;
    const activeIds = new Set(reports.map((r) => r.id));

    // Remove old markers
    for (const [id, marker] of this.hazardMarkers) {
      if (!activeIds.has(id)) {
        marker.setMap(null);
        this.hazardMarkers.delete(id);
      }
    }

    // Add new markers
    for (const report of reports) {
      if (this.hazardMarkers.has(report.id)) continue;

      let color = '#38bdf8'; // Moderate
      let scale = 5;
      if (report.severity === 'alarming') {
        color = '#f87171'; // Muted Rose Alarming
        scale = 7;
      } else if (report.severity === 'severe') {
        color = '#fb923c'; // Warm Terracotta Severe
        scale = 6;
      }

      const marker = new google.maps.Marker({
        position: { lat: report.latitude, lng: report.longitude },
        map: this.map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale,
          fillColor: color,
          fillOpacity: 0.95,
          strokeColor: '#0e131b',
          strokeWeight: 1.5,
        },
        title: `${report.severity.toUpperCase()} Bump: ${report.gForce.toFixed(2)}G`,
      });

      this.hazardMarkers.set(report.id, marker);
    }
  }

  /**
   * Calculates nearest pothole hazard from the rider's current location.
   */
  private updateNearestHazard(): void {
    if (!this.lastKnownPosition || this.allReports.length === 0) {
      this.nearestHazard = null;
      return;
    }

    let minDistance = Infinity;
    let closestReport: PotholeReport | null = null;

    for (const report of this.allReports) {
      const dist = haversineDistance(
        this.lastKnownPosition.latitude,
        this.lastKnownPosition.longitude,
        report.latitude,
        report.longitude,
      );

      if (dist < minDistance) {
        minDistance = dist;
        closestReport = report;
      }
    }

    if (closestReport && minDistance < 5000) {
      this.nearestHazard = {
        distanceMeters: Math.round(minDistance),
        report: closestReport,
      };
    } else {
      this.nearestHazard = null;
    }
  }

  // Real-time Detection Alert Card
  private showAlert(report: PotholeReport): void {
    this.countdownSub?.unsubscribe();
    this.activeAlert = report;
    this.alertProgress = 0;

    const ticks = ALERT_DURATION_MS / ALERT_TICK_MS;
    this.countdownSub = timer(0, ALERT_TICK_MS).subscribe((tick) => {
      this.alertProgress = Math.min(tick / ticks, 1);
      if (tick >= ticks) {
        this.closeAlert();
      }
    });
  }

  quickReport(): void {
    if (!this.activeAlert) return;
    this.telemetryService.confirmReport(this.activeAlert.id);
    this.closeAlert();
  }

  dismiss(): void {
    if (!this.activeAlert) return;
    this.telemetryService.dismissReport(this.activeAlert.id);
    this.closeAlert();
  }

  private closeAlert(): void {
    this.countdownSub?.unsubscribe();
    this.activeAlert = null;
    this.alertProgress = 0;
  }

  // Floating controls: Locate Me & Recenter
  async locateMe(): Promise<void> {
    try {
      const position = await this.mapNavigation.getCurrentPosition();
      this.lastKnownPosition = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      this.updateCurrentLocation(position.coords.latitude, position.coords.longitude);
      this.map?.setCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
      this.map?.setZoom(DEFAULT_ZOOM);
    } catch (error) {
      console.warn('BumpAlert: locateMe failed', error);
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

  async startNavigation(): Promise<void> {
    this.routingError = null;
    if (!this.selectedTo && !this.toText.trim()) {
      this.routingError = 'Enter a valid destination';
      return;
    }

    const origin = this.selectedFrom || this.lastKnownPosition || DEFAULT_CENTER;
    const dest = this.selectedTo || (await this.safeGeocode(this.toText))[0];

    if (!dest) {
      this.routingError = 'Could not resolve destination coordinates';
      return;
    }

    this.routingInProgress = true;
    try {
      const route = await this.mapNavigation.getRoute(origin, dest);
      this.drawRoute(origin, dest, route.points);
      this.routeSummary = {
        distanceKm: (route.distanceMeters / 1000).toFixed(1),
        durationMin: Math.round(route.durationSeconds / 60).toString(),
      };
      this.navigating = true;
      this.searchPanelOpen = false;
    } catch (error) {
      console.warn('Routing failed', error);
      this.routingError = 'Could not calculate navigation route';
    } finally {
      this.routingInProgress = false;
    }
  }

  private drawRoute(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    points: Array<{ latitude: number; longitude: number }>,
  ): void {
    if (!this.map) return;
    this.clearRoute();

    const path = points.map((p) => ({ lat: p.latitude, lng: p.longitude }));
    this.routeLine = new google.maps.Polyline({
      path,
      map: this.map,
      strokeColor: '#38bdf8',
      strokeWeight: 6,
    });

    this.originMarker = new google.maps.Marker({
      position: { lat: origin.latitude, lng: origin.longitude },
      map: this.map,
      title: 'Start',
    });

    this.destinationMarker = new google.maps.Marker({
      position: { lat: destination.latitude, lng: destination.longitude },
      map: this.map,
      title: 'Destination',
    });

    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    this.map.fitBounds(bounds, 50);
  }

  stopNavigation(): void {
    this.clearRoute();
    this.navigating = false;
    this.routeSummary = null;
    this.selectedFrom = null;
    this.selectedTo = null;
    this.fromText = '';
    this.toText = '';
  }

  private clearRoute(): void {
    this.routeLine?.setMap(null);
    this.originMarker?.setMap(null);
    this.destinationMarker?.setMap(null);
    this.routeLine = undefined;
    this.originMarker = undefined;
    this.destinationMarker = undefined;
  }

  private async safeGeocode(query: string): Promise<GeocodeResult[]> {
    return firstValueFrom(
      of(query).pipe(
        switchMap((q) => this.mapNavigation.geocodeAddress(q)),
        catchError(() => of<GeocodeResult[]>([])),
      ),
      { defaultValue: [] },
    );
  }
}
