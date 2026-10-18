/** A single geocoded place suggestion (from/to search results). */
export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
  placeId?: string;
}

/** A point along a computed driving route. */
export interface RoutePoint {
  latitude: number;
  longitude: number;
}

/** One spoken/displayed instruction within a driving route. */
export interface RouteStep {
  instruction: string;
  maneuver: string;
  distanceMeters: number;
  durationSeconds: number;
  start: RoutePoint;
  end: RoutePoint;
}

/** A computed driving route between an origin and destination. */
export interface RouteResult {
  summary: string;
  points: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
}
