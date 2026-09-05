/**
 * Flight Data Provider Interface
 * Abstraction layer for flight information retrieval.
 * Can be swapped with FlightAware AeroAPI (RJTT) or OpenSky Network in future.
 */

import { FlightDeparture, FlightRoute, Waypoint } from './types';

export interface LivePosition {
  lat: number;
  lng: number;
  altitude: number;
  heading: number;
  groundspeedKmh: number;
  timestamp: number;
}

export interface FlightDataProvider {
  /**
   * Retrieves scheduled departures from Haneda (RJTT).
   */
  getDepartures(): Promise<FlightDeparture[]>;

  /**
   * Retrieves full flight route geometry and waypoints.
   */
  getRoute(routeId: string): Promise<FlightRoute>;

  /**
   * (Future extension) Retrieves real-time position from backend proxy.
   */
  getLivePosition?(flightId: string): Promise<LivePosition | null>;

  /**
   * (Future extension) Retrieves flight radar track history.
   */
  getFlightTrack?(flightId: string): Promise<Waypoint[] | null>;
}

