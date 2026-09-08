export type FlightStatus = 'SCHEDULED' | 'BOARDING' | 'DEPARTED' | 'ENROUTE' | 'ARRIVED' | 'CANCELLED' | 'UNKNOWN';
export type RouteType = 'FILED' | 'ACTUAL' | 'ESTIMATED';
export interface SkyRouteAirport {
  icao: string; iata: string | null; name: string | null;
  latitude: number | null; longitude: number | null; altitudeMeters: number | null;
}
export interface SkyRouteFlight {
  id: string; ident: string; callsign: string | null; operator: string | null;
  flightNumber: string | null; origin: SkyRouteAirport; destination: SkyRouteAirport;
  aircraftType: string | null; status: FlightStatus;
  scheduledDeparture: string | null; estimatedDeparture: string | null; actualDeparture: string | null;
  scheduledArrival: string | null; estimatedArrival: string | null; actualArrival: string | null;
}
export interface SkyRoutePosition {
  latitude: number; longitude: number; altitudeMeters: number | null;
  groundSpeedKmh: number | null; heading: number | null; timestamp: string;
  altitudeEstimated: boolean;
}
export type SkyRouteTrackPoint = SkyRoutePosition;
export interface SkyRouteWaypoint { latitude: number; longitude: number; altitudeMeters: number; altitudeEstimated: boolean; }
export interface SkyRouteRoute { type: RouteType; waypoints: SkyRouteWaypoint[]; altitudeEstimated: boolean; }
export interface ApiResult<T> { data: T; source: 'live' | 'mock'; fetchedAt: string; stale: boolean; warning?: string; }
