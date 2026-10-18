import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject, Subscription, firstValueFrom, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { SensorDetectionService, LiveAcceleration, LiveLocation, PermissionState, VehicleMode } from '../../services/sensor-detection.service';
import { MapNavigationService } from '../../services/map-navigation.service';
import { GoogleMapsLoaderService } from '../../services/google-maps-loader.service';
import { TelemetryService, haversineDistance } from '../../services/telemetry.service';
import { WakeLockService } from '../../services/wake-lock.service';
import { PotholeReport, HazardSeverity } from '../../models/pothole-report.model';
import { GeocodeResult, RouteResult, RouteStep } from '../../models/map.model';

const DEFAULT_CENTER = { latitude: 28.4328, longitude: 77.5035 };
const DEFAULT_ZOOM = 17;
const SEARCH_DEBOUNCE_MS = 400;
const NAVIGATION_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#073f4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d2e7e9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#073f4d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#35536a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#0a1f63' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#06174f' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9fc3bf' }] },
];

export interface NearestHazardInfo {
  distanceMeters: number;
  report: PotholeReport;
}

interface RouteOption {
  route: RouteResult;
  hazardCount: number;
  seriousHazardCount: number;
  fastest: boolean;
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
  searchPanelOpen = false;
  toText = '';
  toResults: GeocodeResult[] = [];
  selectedTo: GeocodeResult | null = null;
  searchMessage: string | null = null;
  routingInProgress = false;
  routingError: string | null = null;
  routeCalculated = false;
  navigating = false;
  arrivedAtDestination = false;
  requiresMotionPermission = false;
  routeSummary: { distanceKm: string; durationMin: string } | null = null;
  routeOptions: RouteOption[] = [];
  selectedRouteIndex = 0;
  vehicleMode: VehicleMode = 'bike';
  currentSpeedKph: number | null = null;
  navigationMuted = true;
  navigationStepIndex = 0;
  distanceToNextManeuverMeters = 0;
  remainingDistanceMeters = 0;
  remainingDurationSeconds = 0;
  navigationProgressPercent = 0;
  offRoute = false;
  navigationError: string | null = null;

  mapLoadError: string | null = null;
  private map?: google.maps.Map;
  /** Animated circle overlay centered on the blue dot, for a live location pulse. */
  private locationCircle?: google.maps.Circle;
  private currentLocationMarker?: google.maps.Marker;
  private vehicleAnimationFrameId?: number;
  private vehicleHeading = 0;
  private lastRenderedVehicleHeading?: number;
  private lastRenderedVehicleMode?: VehicleMode;
  private readonly vehicleMarkerImagePromises = new Map<VehicleMode, Promise<HTMLImageElement>>();
  private destinationMarker?: google.maps.Marker;
  private routeLine?: google.maps.Polyline;
  private readonly alternativeRouteLines: google.maps.Polyline[] = [];
  /** Chronological line inferred from the GPS locations captured with telemetry. */
  private telemetryPathLine?: google.maps.Polyline;
  private lastKnownPosition: { latitude: number; longitude: number } | null = null;
  private offRouteReadings = 0;
  private hasCenteredOnCurrentLocation = false;
  private readonly hazardMarkers = new Map<string, google.maps.Marker>();
  private hazardInfoWindow?: google.maps.InfoWindow;
  private allReports: PotholeReport[] = [];

  private readonly toQuery$ = new Subject<string>();

  private gForceSub?: Subscription;
  private accelSub?: Subscription;
  private detectSub?: Subscription;
  private reportsSub?: Subscription;
  private positionSub?: Subscription;
  private toSearchSub?: Subscription;
  private permissionSub?: Subscription;
  private vehicleModeSub?: Subscription;

  // Motion permission state — drives the permission prompt banner
  motionPermissionState: PermissionState = 'unknown';

  /** Expose Math to the template for inline width calculations on the info bars. */
  readonly Math = Math;

  constructor(
    private readonly sensorDetection: SensorDetectionService,
    private readonly mapNavigation: MapNavigationService,
    private readonly googleMapsLoader: GoogleMapsLoaderService,
    private readonly telemetryService: TelemetryService,
    private readonly wakeLock: WakeLockService,
    private readonly toastCtrl: ToastController,
    private readonly router: Router,
  ) {}

  // Removed closeMap — map is now a persistent tab in the bottom navigation

  async ngOnInit(): Promise<void> {
    await this.initMap();

    this.vehicleModeSub = this.sensorDetection.vehicleMode$.subscribe((mode) => {
      this.vehicleMode = mode;
      if (this.navigating) this.updateVehicleMarkerIcon();
    });

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
      this.syncTelemetryPath(reports);
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
        speed: position.coords.speed,
        altitude: position.coords.altitude,
      };
      this.currentSpeedKph = position.coords.speed === null || position.coords.speed < 0
        ? null
        : Math.round(position.coords.speed * 3.6);
      this.updateCurrentLocation(position.coords.latitude, position.coords.longitude);
      if (this.navigating) {
        this.map?.panTo({ lat: position.coords.latitude, lng: position.coords.longitude });
        this.updateNavigationProgress();
      }
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
    this.requiresMotionPermission = this.sensorDetection.needsMotionPermissionPrompt();
    if (!this.requiresMotionPermission) {
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
    this.stopLocationAnimation();
    this.cancelVehicleMarkerAnimation();
    this.locationCircle?.setMap(null);
    this.locationCircle = undefined;
    this.gForceSub?.unsubscribe();
    this.accelSub?.unsubscribe();
    this.detectSub?.unsubscribe();
    this.reportsSub?.unsubscribe();
    this.positionSub?.unsubscribe();
    this.toSearchSub?.unsubscribe();
    this.permissionSub?.unsubscribe();
    this.vehicleModeSub?.unsubscribe();
    // Sensing belongs to the Live Telemetry experience, not to this optional map.
    // Leaving the map must never interrupt ongoing telemetry collection.
    await this.wakeLock.disable();
    await this.mapNavigation.stopTracking();
  }

  private async initMap(): Promise<void> {
    try {
      const maps = await this.googleMapsLoader.load();
      this.map = new maps.Map(this.mapContainerRef.nativeElement, {
        center: { lat: DEFAULT_CENTER.latitude, lng: DEFAULT_CENTER.longitude },
        zoom: DEFAULT_ZOOM,
        // Use one high-contrast theme before and during a trip, so navigation
        // does not visually jump from a light map to a dark map.
        styles: NAVIGATION_MAP_STYLES,
        // Read-only telemetry map: show only detections and their inferred path.
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: 'greedy',
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
      const toast = await this.toastCtrl.create({
        message: 'Motion sensing enabled. Bump detection is active.',
        duration: 2500,
        position: 'bottom',
      });
      await toast.present();
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
    const gpsPosition = { lat: latitude, lng: longitude };
    const routeProjection = this.navigating
      ? this.getVehicleRouteProjection(latitude, longitude)
      : null;
    if (routeProjection) {
      this.vehicleHeading = routeProjection.heading;
    }
    const position = this.navigating && routeProjection && routeProjection.distanceMeters <= 45
      ? routeProjection.position
      : gpsPosition;

    if (!this.currentLocationMarker) {
      // Animated pulse circle
      this.locationCircle = new google.maps.Circle({
        center: gpsPosition,
        map: this.map,
        radius: 35,
        fillColor: '#3880ff88',
        fillOpacity: 0.6,
        strokeColor: '#3880ff',
        strokeOpacity: 0.0,
        strokeWeight: 0,
        zIndex: 99,
      });

      this.currentLocationMarker = new google.maps.Marker({
        position: gpsPosition,
        map: this.map,
        zIndex: 100,
        title: 'Current location',
        icon: this.createLocationMarkerIcon(),
      });
      if (this.navigating) void this.updateVehicleMarkerIcon();
      this.map.setCenter(gpsPosition);
      this.map.setZoom(DEFAULT_ZOOM);
      this.hasCenteredOnCurrentLocation = true;
      this.animateLocationPulse();
    } else {
      this.currentLocationMarker.setTitle(this.navigating
        ? `${this.vehicleMode === 'car' ? 'Car' : 'Bike'} navigation position`
        : 'Current location');
      if (this.navigating) {
        void this.updateVehicleMarkerIcon();
        this.animateVehicleMarker(position);
      } else {
        this.cancelVehicleMarkerAnimation();
        this.currentLocationMarker.setPosition(gpsPosition);
        this.currentLocationMarker.setIcon(this.createLocationMarkerIcon());
        this.lastRenderedVehicleMode = undefined;
        this.lastRenderedVehicleHeading = undefined;
      }
      this.locationCircle?.setCenter(gpsPosition);
      if (!this.hasCenteredOnCurrentLocation) {
        this.map.setCenter(gpsPosition);
        this.map.setZoom(DEFAULT_ZOOM);
        this.hasCenteredOnCurrentLocation = true;
      }
    }
  }

  private createLocationMarkerIcon(): google.maps.Symbol {
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: '#3880ff',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 8,
    };
  }

  private async updateVehicleMarkerIcon(): Promise<void> {
    const marker = this.currentLocationMarker;
    const mode = this.vehicleMode;
    if (!marker || !this.navigating) return;
    const headingDifference = this.lastRenderedVehicleHeading === undefined
      ? Infinity
      : Math.abs(((this.vehicleHeading - this.lastRenderedVehicleHeading + 540) % 360) - 180);
    if (this.lastRenderedVehicleMode === mode && headingDifference < 6) return;

    marker.setTitle(`${mode === 'car' ? 'Car' : 'Bike'} navigation position`);
    let image: HTMLImageElement;
    try {
      image = await this.loadVehicleMarkerImage(mode);
    } catch (error) {
      console.error('BumpAlert: vehicle navigation icon could not be loaded.', error);
      return;
    }
    if (this.currentLocationMarker !== marker || !this.navigating || this.vehicleMode !== mode) return;

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) {
      console.error('BumpAlert: could not render the navigation vehicle marker.');
      return;
    }
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(this.vehicleHeading * Math.PI / 180);
    context.drawImage(image, -40, -40, 80, 80);
    marker.setIcon({
      url: canvas.toDataURL('image/png'),
      scaledSize: new google.maps.Size(48, 48),
      anchor: new google.maps.Point(24, 24),
    });
    this.lastRenderedVehicleMode = mode;
    this.lastRenderedVehicleHeading = this.vehicleHeading;
  }

  private loadVehicleMarkerImage(mode: VehicleMode): Promise<HTMLImageElement> {
    const cached = this.vehicleMarkerImagePromises.get(mode);
    if (cached) return cached;

    const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => {
        this.vehicleMarkerImagePromises.delete(mode);
        reject(new Error(`Could not load ${mode} navigation PNG.`));
      };
      image.src = new URL(
        mode === 'car' ? 'assets/map/car-navigation.png' : 'assets/map/bike-navigation.png',
        document.baseURI,
      ).toString();
    });
    this.vehicleMarkerImagePromises.set(mode, imagePromise);
    return imagePromise;
  }

  private animateVehicleMarker(target: google.maps.LatLngLiteral): void {
    if (!this.currentLocationMarker) return;
    this.cancelVehicleMarkerAnimation();
    const from = this.currentLocationMarker.getPosition();
    if (!from) {
      this.currentLocationMarker.setPosition(target);
      return;
    }

    const start = { lat: from.lat(), lng: from.lng() };
    const startedAt = performance.now();
    const durationMs = 650;
    const animate = (now: number): void => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const easedProgress = progress * progress * (3 - 2 * progress);
      const position = {
        lat: start.lat + (target.lat - start.lat) * easedProgress,
        lng: start.lng + (target.lng - start.lng) * easedProgress,
      };
      this.currentLocationMarker?.setPosition(position);
      this.locationCircle?.setCenter(position);
      if (progress < 1) {
        this.vehicleAnimationFrameId = requestAnimationFrame(animate);
      } else {
        this.vehicleAnimationFrameId = undefined;
      }
    };
    this.vehicleAnimationFrameId = requestAnimationFrame(animate);
  }

  private cancelVehicleMarkerAnimation(): void {
    if (this.vehicleAnimationFrameId !== undefined) {
      cancelAnimationFrame(this.vehicleAnimationFrameId);
      this.vehicleAnimationFrameId = undefined;
    }
  }

  private getVehicleRouteProjection(
    latitude: number,
    longitude: number,
  ): { position: google.maps.LatLngLiteral; heading: number; distanceMeters: number } | null {
    const points = this.selectedRoute?.points ?? [];
    if (points.length < 2) return null;

    const longitudeScale = 111320 * Math.cos(latitude * Math.PI / 180);
    let nearest: { position: google.maps.LatLngLiteral; heading: number; distanceMeters: number } | null = null;
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      const startX = (start.longitude - longitude) * longitudeScale;
      const startY = (start.latitude - latitude) * 110540;
      const endX = (end.longitude - longitude) * longitudeScale;
      const endY = (end.latitude - latitude) * 110540;
      const segmentX = endX - startX;
      const segmentY = endY - startY;
      const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
      const fraction = segmentLengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, -(startX * segmentX + startY * segmentY) / segmentLengthSquared));
      const projectedLatitude = start.latitude + fraction * (end.latitude - start.latitude);
      const projectedLongitude = start.longitude + fraction * (end.longitude - start.longitude);
      const distanceMeters = Math.hypot(startX + fraction * segmentX, startY + fraction * segmentY);
      if (nearest && distanceMeters >= nearest.distanceMeters) continue;

      const startLatitudeRadians = start.latitude * Math.PI / 180;
      const endLatitudeRadians = end.latitude * Math.PI / 180;
      const longitudeDifference = (end.longitude - start.longitude) * Math.PI / 180;
      const y = Math.sin(longitudeDifference) * Math.cos(endLatitudeRadians);
      const x = Math.cos(startLatitudeRadians) * Math.sin(endLatitudeRadians)
        - Math.sin(startLatitudeRadians) * Math.cos(endLatitudeRadians) * Math.cos(longitudeDifference);
      const heading = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      nearest = {
        position: { lat: projectedLatitude, lng: projectedLongitude },
        heading,
        distanceMeters,
      };
    }
    return nearest;
  }

  private animationFrameId?: number;
  private pulsePhase = 0;

  private animateLocationPulse(): void {
    if (!this.locationCircle) return;
    this.pulsePhase += 0.05;

    const radius = 35 + 15 * Math.sin(this.pulsePhase);
    const opacity = 0.6 + 0.2 * Math.sin(this.pulsePhase);

    this.locationCircle.set('radius', radius);
    this.locationCircle.set('fillOpacity', opacity);

    this.animationFrameId = requestAnimationFrame(() => this.animateLocationPulse());
  }

  private stopLocationAnimation(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
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

      let color = '#fbbf24';
      let scale = 9;
      if (report.severity === 'alarming') {
        color = '#f87171';
        scale = 13;
      } else if (report.severity === 'severe') {
        color = '#fb923c';
        scale = 11;
      }

      const marker = new google.maps.Marker({
        position: { lat: report.latitude, lng: report.longitude },
        map: this.map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale,
          fillColor: color,
          fillOpacity: 0.82,
          strokeColor: '#24323a',
          strokeOpacity: 0.65,
          strokeWeight: 1.5,
        },
        title: `${report.severity.toUpperCase()} Bump: ${report.gForce.toFixed(2)}G`,
      });
      marker.addListener('click', () => {
        if (!this.hazardInfoWindow) this.hazardInfoWindow = new google.maps.InfoWindow();
        this.hazardInfoWindow.setContent(`<strong>${report.severity.toUpperCase()} anomaly</strong><br>${report.gForce.toFixed(2)} G · ${new Date(report.timestamp).toLocaleString()}<br>${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}`);
        this.hazardInfoWindow.open(this.map, marker);
      });

      this.hazardMarkers.set(report.id, marker);
    }
  }

  /**
   * A detection has one GPS point, so this is an inferred travel path rather
   * than turn-by-turn navigation. It remains available without Directions API.
   */
  private syncTelemetryPath(reports: PotholeReport[]): void {
    if (!this.map) return;
    const path = [...reports]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((report) => ({ lat: report.latitude, lng: report.longitude }));

    this.telemetryPathLine?.setMap(null);
    this.telemetryPathLine = undefined;
    if (path.length < 2) return;

    this.telemetryPathLine = new google.maps.Polyline({
      path,
      map: this.map,
      strokeColor: '#38bdf8',
      strokeOpacity: 0.82,
      strokeWeight: 4,
      geodesic: true,
      zIndex: 1,
    });

    // Show the complete recorded area on first opening the optional map.
    if (!this.hasCenteredOnCurrentLocation) {
      const bounds = new google.maps.LatLngBounds();
      path.forEach((point) => bounds.extend(point));
      this.map.fitBounds(bounds, 48);
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
      this.hasCenteredOnCurrentLocation = true;
    } catch (error) {
      console.warn('BumpAlert: locateMe failed', error);
    }
  }

  toggleSearchPanel(): void {
    this.searchPanelOpen = !this.searchPanelOpen;
    if (this.searchPanelOpen) {
      this.routingError = null;
    }
  }

  onToInput(value: string): void {
    this.toText = value;
    this.selectedTo = null;
    this.routeCalculated = false;
    this.routeOptions = [];
    this.selectedRouteIndex = 0;
    this.clearRoute();
    this.searchMessage = value.trim().length ? null : 'Enter a destination to search.';
    this.toQuery$.next(value);
  }

  selectTo(result: GeocodeResult): void {
    this.selectedTo = result;
    this.toText = result.label;
    this.toResults = [];
    this.routeCalculated = false;
    this.routeOptions = [];
    this.selectedRouteIndex = 0;
    this.routingError = null;
    this.searchMessage = null;
    this.clearRoute();
    this.destinationMarker?.setMap(null);
    this.destinationMarker = new google.maps.Marker({
      position: { lat: result.latitude, lng: result.longitude }, map: this.map, title: result.label,
      label: { text: 'D', color: '#ffffff', fontWeight: '700' },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#0284c7', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 },
      zIndex: 120,
    });
    this.map?.panTo({ lat: result.latitude, lng: result.longitude });
    this.map?.setZoom(15);
    void this.calculateRoute();
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
      const routes = await this.mapNavigation.getRoutes(origin, dest);
      this.selectedTo = dest;
      this.toText = dest.label;
      const fastestDuration = Math.min(...routes.map((route) => route.durationSeconds));
      this.routeOptions = routes.map((route) => {
        const nearbyHazards = this.allReports.filter((report) =>
          report.status !== 'dismissed' && this.distanceFromRouteMeters(report.latitude, report.longitude, route) <= 60,
        );
        return {
          route,
          hazardCount: nearbyHazards.length,
          seriousHazardCount: nearbyHazards.filter((report) =>
            report.severity === 'severe' || report.severity === 'alarming',
          ).length,
          fastest: route.durationSeconds === fastestDuration,
        };
      });
      this.selectedRouteIndex = 0;
      this.routeCalculated = true;
      this.selectRoute(0);
    } catch (error) {
      console.warn('Routing failed', error);
      this.routingError = 'Could not calculate a route. Check your connection and try again.';
    } finally {
      this.routingInProgress = false;
    }
  }

  selectRoute(index: number, fitMapToRoute = true): void {
    const option = this.routeOptions[index];
    if (!option || !this.selectedTo) return;
    this.selectedRouteIndex = index;
    const route = option.route;
    this.drawRoute(this.selectedTo, route.points, fitMapToRoute);
    this.routeSummary = {
      distanceKm: (route.distanceMeters / 1000).toFixed(1),
      durationMin: Math.round(route.durationSeconds / 60).toString(),
    };
  }

  selectVehicleMode(mode: VehicleMode): void {
    if (mode !== 'bike' && mode !== 'car') return;
    this.sensorDetection.setVehicleMode(mode);
  }

  get vehicleModeDescription(): string {
    return this.vehicleMode === 'bike'
      ? 'More sensitive to sharper impacts'
      : 'Filters car motion using speed and movement context';
  }

  onRouteSelectionChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const index = Number(target.value);
    if (Number.isInteger(index)) {
      this.selectRoute(index);
    }
  }

  editDestination(): void {
    this.routeCalculated = false;
    this.routeOptions = [];
    this.selectedRouteIndex = 0;
    this.routeSummary = null;
    this.clearRoute();
  }

  startNavigation(): void {
    if (!this.routeCalculated || !this.routeSummary || !this.selectedRoute) return;
    this.navigating = true;
    this.arrivedAtDestination = false;
    this.offRoute = false;
    this.navigationError = null;
    this.offRouteReadings = 0;
    this.navigationStepIndex = 0;
    this.searchPanelOpen = false;
    if (this.lastKnownPosition) {
      this.updateCurrentLocation(this.lastKnownPosition.latitude, this.lastKnownPosition.longitude);
      this.map?.panTo({ lat: this.lastKnownPosition.latitude, lng: this.lastKnownPosition.longitude });
    }
    this.updateNavigationProgress();
    this.announceNavigationInstruction();
    void this.toastCtrl.create({
      message: 'Navigation started. Follow the on-screen directions and watch for reported road hazards.',
      duration: 2500,
      position: 'bottom',
    }).then((toast) => toast.present());
  }

  private drawRoute(
    destination: GeocodeResult,
    points: Array<{ latitude: number; longitude: number }>,
    fitMapToRoute = true,
  ): void {
    if (!this.map) return;
    this.clearRoute();

    const path = points.map((p) => ({ lat: p.latitude, lng: p.longitude }));
    this.routeLine = new google.maps.Polyline({
      path,
      map: this.map,
      strokeColor: this.routeOptions[this.selectedRouteIndex]?.fastest ? '#4ade80' : '#38bdf8',
      strokeOpacity: 0.98,
      strokeWeight: 12,
      zIndex: 30,
      clickable: true,
    });
    const selectedIndex = this.selectedRouteIndex;
    this.routeLine.addListener('click', () => this.selectRoute(selectedIndex, false));
    this.routeOptions.forEach((option, index) => {
      if (index === this.selectedRouteIndex) return;
      const line = new google.maps.Polyline({
        path: option.route.points.map((point) => ({ lat: point.latitude, lng: point.longitude })),
        map: this.map,
        strokeColor: option.fastest ? '#4ade80' : '#c6d8de',
        strokeOpacity: option.fastest ? 0.9 : 0.62,
        strokeWeight: 9,
        zIndex: option.fastest ? 20 : 10,
        clickable: true,
      });
      line.addListener('click', () => this.selectRoute(index, false));
      this.alternativeRouteLines.push(line);
    });

    this.destinationMarker?.setMap(null);
    this.destinationMarker = new google.maps.Marker({
      position: { lat: destination.latitude, lng: destination.longitude },
      map: this.map,
      title: `Destination: ${destination.label}`,
      label: { text: 'D', color: '#ffffff', fontWeight: '700' },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#0284c7', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 },
      zIndex: 120,
    });

    if (fitMapToRoute) {
      const bounds = new google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      this.map.fitBounds(bounds, 50);
    }
  }

  stopNavigation(): void {
    this.cancelVehicleMarkerAnimation();
    this.clearRoute();
    this.navigating = false;
    this.arrivedAtDestination = false;
    this.routeSummary = null;
    this.selectedTo = null;
    this.toText = '';
    this.routeCalculated = false;
    this.routeOptions = [];
    this.navigationStepIndex = 0;
    this.offRoute = false;
    this.navigationError = null;
    this.offRouteReadings = 0;
    this.remainingDistanceMeters = 0;
    this.remainingDurationSeconds = 0;
    this.navigationProgressPercent = 0;
    window.speechSynthesis?.cancel();
    if (this.lastKnownPosition) {
      this.updateCurrentLocation(this.lastKnownPosition.latitude, this.lastKnownPosition.longitude);
    } else if (this.currentLocationMarker) {
      this.currentLocationMarker.setTitle('Current location');
      this.currentLocationMarker.setIcon(this.createLocationMarkerIcon());
      this.lastRenderedVehicleMode = undefined;
      this.lastRenderedVehicleHeading = undefined;
    }
  }

  get selectedRoute(): RouteResult | null {
    return this.routeOptions[this.selectedRouteIndex]?.route ?? null;
  }

  get activeNavigationStep(): RouteStep | null {
    return this.arrivedAtDestination ? null : this.selectedRoute?.steps[this.navigationStepIndex] ?? null;
  }

  get maneuverIcon(): string {
    const maneuver = this.activeNavigationStep?.maneuver ?? '';
    if (maneuver.includes('roundabout')) return 'sync';
    if (maneuver.includes('uturn') || maneuver.includes('left')) return 'arrow-back';
    if (maneuver.includes('right')) return 'arrow-forward';
    if (maneuver.includes('merge') || maneuver.includes('fork')) return 'git-merge';
    if (maneuver.includes('destination')) return 'flag';
    return 'arrow-up';
  }

  get formattedNextTurnDistance(): string {
    if (this.distanceToNextManeuverMeters >= 1000) {
      return `${(this.distanceToNextManeuverMeters / 1000).toFixed(1)} km`;
    }
    return `${Math.max(0, Math.round(this.distanceToNextManeuverMeters / 10) * 10)} m`;
  }

  get formattedRemainingDistance(): string {
    return this.remainingDistanceMeters >= 1000
      ? `${(this.remainingDistanceMeters / 1000).toFixed(1)} km`
      : `${Math.max(0, Math.round(this.remainingDistanceMeters / 10) * 10)} m`;
  }

  get formattedArrivalTime(): string {
    const arrival = new Date(Date.now() + this.remainingDurationSeconds * 1000);
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(arrival);
  }

  private updateNavigationProgress(): void {
    const route = this.selectedRoute;
    const position = this.lastKnownPosition;
    if (!route || !position || route.steps.length === 0 || this.arrivedAtDestination) return;

    const currentStep = route.steps[this.navigationStepIndex];
    if (!currentStep) return;
    const distanceFromRoute = this.distanceFromRouteMeters(position.latitude, position.longitude, route);
    this.offRouteReadings = distanceFromRoute > 85 ? this.offRouteReadings + 1 : 0;
    if (this.offRouteReadings >= 3) {
      this.offRoute = true;
    } else if (distanceFromRoute < 55) {
      this.offRoute = false;
      this.navigationError = null;
    }
    this.distanceToNextManeuverMeters = haversineDistance(
      position.latitude, position.longitude, currentStep.end.latitude, currentStep.end.longitude,
    );

    if (this.distanceToNextManeuverMeters <= 35) {
      if (this.navigationStepIndex >= route.steps.length - 1) {
        this.arrivedAtDestination = true;
        this.distanceToNextManeuverMeters = 0;
        this.remainingDistanceMeters = 0;
        this.remainingDurationSeconds = 0;
        this.navigationProgressPercent = 100;
        this.announceNavigationInstruction();
        return;
      }
      this.navigationStepIndex += 1;
      this.announceNavigationInstruction();
      this.updateNavigationProgress();
      return;
    }

    const remainingSteps = route.steps.slice(this.navigationStepIndex + 1);
    this.remainingDistanceMeters = this.distanceToNextManeuverMeters
      + remainingSteps.reduce((sum, step) => sum + step.distanceMeters, 0);
    const currentStepFraction = currentStep.distanceMeters > 0
      ? Math.min(this.distanceToNextManeuverMeters / currentStep.distanceMeters, 1)
      : 1;
    this.remainingDurationSeconds = currentStep.durationSeconds * currentStepFraction
      + remainingSteps.reduce((sum, step) => sum + step.durationSeconds, 0);
    this.navigationProgressPercent = route.distanceMeters > 0
      ? Math.min(100, Math.max(0, (1 - this.remainingDistanceMeters / route.distanceMeters) * 100))
      : 0;
  }

  private announceNavigationInstruction(): void {
    if (this.navigationMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const instruction = this.arrivedAtDestination
      ? 'You have arrived at your destination.'
      : this.activeNavigationStep?.instruction;
    if (!instruction) return;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(instruction));
  }

  private distanceFromRouteMeters(latitude: number, longitude: number, route: RouteResult): number {
    const points = route.points;
    if (points.length === 0) return Infinity;
    if (points.length === 1) {
      return haversineDistance(latitude, longitude, points[0].latitude, points[0].longitude);
    }

    let minimumDistance = Infinity;
    const longitudeScale = 111320 * Math.cos(latitude * Math.PI / 180);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const ax = (previous.longitude - longitude) * longitudeScale;
      const ay = (previous.latitude - latitude) * 110540;
      const bx = (current.longitude - longitude) * longitudeScale;
      const by = (current.latitude - latitude) * 110540;
      const segmentX = bx - ax;
      const segmentY = by - ay;
      const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
      const projection = segmentLengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, -(ax * segmentX + ay * segmentY) / segmentLengthSquared));
      const nearestX = ax + projection * segmentX;
      const nearestY = ay + projection * segmentY;
      minimumDistance = Math.min(minimumDistance, Math.hypot(nearestX, nearestY));
    }
    return minimumDistance;
  }

  async recalculateNavigationRoute(): Promise<void> {
    const destination = this.selectedTo;
    const origin = this.lastKnownPosition;
    if (!destination || !origin || this.routingInProgress) return;

    this.routingInProgress = true;
    this.navigationError = null;
    try {
      const routes = await this.mapNavigation.getRoutes(origin, destination);
      const fastestDuration = Math.min(...routes.map((route) => route.durationSeconds));
      this.routeOptions = routes.map((route) => {
        const nearbyHazards = this.allReports.filter((report) =>
          report.status !== 'dismissed' && this.distanceFromRouteMeters(report.latitude, report.longitude, route) <= 60,
        );
        return {
          route,
          hazardCount: nearbyHazards.length,
          seriousHazardCount: nearbyHazards.filter((report) =>
            report.severity === 'severe' || report.severity === 'alarming',
          ).length,
          fastest: route.durationSeconds === fastestDuration,
        };
      });
      this.selectedRouteIndex = 0;
      this.navigationStepIndex = 0;
      this.arrivedAtDestination = false;
      this.offRouteReadings = 0;
      this.offRoute = false;
      this.selectRoute(0);
      this.updateNavigationProgress();
    } catch (error) {
      console.warn('Navigation route recalculation failed', error);
      this.navigationError = 'Could not update the route. Check your connection and try again.';
    } finally {
      this.routingInProgress = false;
    }
  }

  toggleNavigationAudio(): void {
    this.navigationMuted = !this.navigationMuted;
    if (this.navigationMuted) {
      window.speechSynthesis?.cancel();
    } else {
      this.announceNavigationInstruction();
    }
  }

  async explainAutomaticReporting(): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: 'Road anomalies detected during navigation are saved automatically.',
      duration: 2600,
      position: 'bottom',
    });
    await toast.present();
  }

  private clearRoute(): void {
    this.routeLine?.setMap(null);
    for (const line of this.alternativeRouteLines) {
      line.setMap(null);
    }
    this.alternativeRouteLines.length = 0;
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
