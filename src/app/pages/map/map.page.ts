import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject, Subscription, firstValueFrom, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { ToastController } from '@ionic/angular';
import { SensorDetectionService, LiveAcceleration, LiveLocation, PermissionState } from '../../services/sensor-detection.service';
import { MapNavigationService } from '../../services/map-navigation.service';
import { GoogleMapsLoaderService } from '../../services/google-maps-loader.service';
import { TelemetryService, haversineDistance } from '../../services/telemetry.service';
import { WakeLockService } from '../../services/wake-lock.service';
import { PotholeReport, HazardSeverity } from '../../models/pothole-report.model';
import { GeocodeResult } from '../../models/map.model';

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
  hasLiveTelemetry = false;
  liveAcceleration: LiveAcceleration = { x: 0, y: 0, z: 0 };
  liveLocation: LiveLocation | null = null;
  isRideActive = false;

  // Nearest Pothole Alert HUD
  nearestHazard: NearestHazardInfo | null = null;

  // Navigation and Route Planner
  searchPanelOpen = true;
  toText = '';
  toResults: GeocodeResult[] = [];
  selectedTo: GeocodeResult | null = null;
  searchMessage: string | null = null;
  routingInProgress = false;
  routingError: string | null = null;
  routeCalculated = false;
  navigating = false;
  routeSummary: { distanceKm: string; durationMin: string } | null = null;

  mapLoadError: string | null = null;
  private map?: google.maps.Map;
  private currentLocationMarker?: google.maps.Marker;
  private destinationMarker?: google.maps.Marker;
  private routeLine?: google.maps.Polyline;
  private lastKnownPosition: { latitude: number; longitude: number } | null = null;
  private readonly hazardMarkers = new Map<string, google.maps.Marker>();
  private allReports: PotholeReport[] = [];

  private readonly toQuery$ = new Subject<string>();

  private gForceSub?: Subscription;
  private accelSub?: Subscription;
  private detectSub?: Subscription;
  private reportsSub?: Subscription;
  private positionSub?: Subscription;
  private toSearchSub?: Subscription;
  private permissionSub?: Subscription;

  // Motion permission state — drives the permission prompt banner
  motionPermissionState: PermissionState = 'unknown';

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

    // Track motion permission state for the UI banner
    this.permissionSub = this.sensorDetection.motionPermissionState$.subscribe((state) => {
      this.motionPermissionState = state;
    });

    // 1. Live G-force stream for glassmorphism HUD meter
    this.gForceSub = this.sensorDetection.liveGForce$.subscribe((gForce) => {
      this.currentGForce = gForce;
      this.hasLiveTelemetry = true;
    });

    this.accelSub = this.sensorDetection.liveAcceleration$.subscribe((axes) => {
      this.liveAcceleration = axes;
    });

    // 2. Real-time bump detection notifications
    this.detectSub = this.sensorDetection.potholeDetected$.subscribe((report) => {
      void this.showDetectionNotification(report);
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

    // 5. Destination autocomplete stream
    this.toSearchSub = this.toQuery$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((query) => this.safeGeocode(query)),
      )
      .subscribe((results) => {
        this.toResults = results;
        if (this.toText.trim().length >= 3 && results.length === 0 && !this.searchMessage) {
          this.searchMessage = 'No destinations found.';
        }
      });

    await this.mapNavigation.startTracking();

    // Only auto-start if permission is not required (Android / non-iOS)
    if (!this.sensorDetection.needsMotionPermissionPrompt()) {
      await this.startRide();
    }
    // On iOS: show permission banner — user must tap "Enable Sensing" button
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
    this.toSearchSub?.unsubscribe();
    this.permissionSub?.unsubscribe();
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

  /**
   * Called from the iOS permission banner button — must be a direct user gesture.
   * Requests DeviceMotion permission then starts sensing immediately.
   */
  async enableMotionSensing(): Promise<void> {
    const granted = await this.sensorDetection.requestMotionPermission();
    if (granted) {
      await this.startRide();
    } else {
      const toast = await this.toastCtrl.create({
        message: 'Motion access denied. Enable it in device Settings to detect road bumps.',
        duration: 4000,
        position: 'bottom',
      });
      await toast.present();
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

      let color = '#38bdf8';
      let scale = 10;
      if (report.severity === 'alarming') {
        color = '#f87171';
        scale = 14;
      } else if (report.severity === 'severe') {
        color = '#fb923c';
        scale = 12;
      }

      const marker = new google.maps.Marker({
        position: { lat: report.latitude, lng: report.longitude },
        map: this.map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale,
          fillColor: color,
          fillOpacity: 0.95,
          strokeColor: '#ffffff',
          strokeWeight: 3,
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

  private async showDetectionNotification(report: PotholeReport): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: `Potential ${report.severity} bump detected and saved to this session`,
      duration: 3000,
      position: 'top',
      color: report.severity === 'alarming' ? 'danger' : 'warning',
    });
    await toast.present();
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

  onToInput(value: string): void {
    this.toText = value;
    this.selectedTo = null;
    this.routeCalculated = false;
    this.searchMessage = value.trim().length ? null : 'Enter a destination to search.';
    this.toQuery$.next(value);
  }

  selectTo(result: GeocodeResult): void {
    this.selectedTo = result;
    this.toText = result.label;
    this.toResults = [];
    this.routeCalculated = false;
    this.routingError = null;
    this.searchMessage = null;
    this.destinationMarker?.setMap(null);
    this.destinationMarker = new google.maps.Marker({
      position: { lat: result.latitude, lng: result.longitude }, map: this.map, title: result.label,
      label: { text: 'D', color: '#ffffff', fontWeight: '700' },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#0284c7', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 },
      zIndex: 120,
    });
    this.map?.panTo({ lat: result.latitude, lng: result.longitude });
    this.map?.setZoom(15);
  }

  async calculateRoute(): Promise<void> {
    this.routingError = null;
    if (!this.selectedTo && !this.toText.trim()) {
      this.routingError = 'Enter a valid destination';
      return;
    }

    const dest = this.selectedTo || (await this.safeGeocode(this.toText))[0];

    if (!dest) {
      this.routingError = 'Choose a destination from the search suggestions.';
      return;
    }

    let origin = this.lastKnownPosition;
    if (!origin) {
      try {
        const position = await this.mapNavigation.getCurrentPosition();
        origin = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        this.lastKnownPosition = origin;
        this.updateCurrentLocation(origin.latitude, origin.longitude);
      } catch {
        this.routingError = 'Current location is required for directions. Enable location access and try again.';
        return;
      }
    }

    this.routingInProgress = true;
    try {
      const route = await this.mapNavigation.getRoute(origin, dest);
      this.drawRoute(origin, dest, route.points);
      this.routeSummary = {
        distanceKm: (route.distanceMeters / 1000).toFixed(1),
        durationMin: Math.round(route.durationSeconds / 60).toString(),
      };
      this.routeCalculated = true;
    } catch (error) {
      console.warn('Routing failed', error);
      this.routingError = 'Could not calculate navigation route';
    } finally {
      this.routingInProgress = false;
    }
  }

  startNavigation(): void {
    if (!this.routeCalculated || !this.routeSummary) return;
    this.navigating = true;
    this.searchPanelOpen = false;
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

    this.destinationMarker?.setMap(null);
    this.destinationMarker = new google.maps.Marker({ position: { lat: destination.latitude, lng: destination.longitude }, map: this.map, title: 'Destination' });

    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    this.map.fitBounds(bounds, 50);
  }

  stopNavigation(): void {
    this.clearRoute();
    this.navigating = false;
    this.routeSummary = null;
    this.selectedTo = null;
    this.toText = '';
    this.routeCalculated = false;
  }

  private clearRoute(): void {
    this.routeLine?.setMap(null);
    this.destinationMarker?.setMap(null);
    this.routeLine = undefined;
    this.destinationMarker = undefined;
  }

  private async safeGeocode(query: string): Promise<GeocodeResult[]> {
    try {
      return await firstValueFrom(of(query).pipe(switchMap((q) => this.mapNavigation.geocodeAddress(q))), { defaultValue: [] });
    } catch (error) {
      console.warn('Destination search failed', error);
      this.searchMessage = 'Unable to search destinations right now.';
      return [];
    }
  }
}
