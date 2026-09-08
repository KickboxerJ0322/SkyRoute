/**
 * Flight Domain Models & Type Definitions
 */

export interface Waypoint {
  lat: number;
  lng: number;
  altitude: number; // in meters (Absolute MSL)
  name?: string;
}

export interface Airport {
  code: string; // IATA (e.g. HND)
  icao: string; // ICAO (e.g. RJTT)
  name: string;
  city: string;
  lat: number;
  lng: number;
  altitude: number;
}

export interface FlightRoute {
  id: string;
  flightNumber: string;
  airline: string;
  aircraftType: string;
  origin: Airport;
  destination: Airport;
  durationSeconds: number; // Nominal simulated duration
  waypoints: Waypoint[];
  description?: string;
}

export interface FlightDeparture {
  id: string;
  flightNumber: string;
  airline: string;
  aircraftType: string;
  destinationCode: string;
  destinationName: string;
  destinationCity: string;
  scheduledTime: string;
  gate: string;
  status: string;
}

export interface TelemetryData {
  lat: number;
  lng: number;
  altitude: number; // meters
  speedKmh: number; // km/h
  heading: number; // degrees 0-359
  pitch: number; // degrees (nose up/down)
  roll: number; // degrees (bank left/right)
  progress: number; // 0.0 to 1.0
  distanceRemainingKm: number;
  totalDistanceKm: number;
  isClimbing: boolean;
  isDescent: boolean;
  flightPhase: 'Takeoff' | 'Climb' | 'Cruise' | 'Descent' | 'Approach' | 'Landed';
}

