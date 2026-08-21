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

/** A computed driving route between an origin and destination. */
export interface RouteResult {
  points: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
}
