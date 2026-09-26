/**
 * Demo Flight Data Provider
 * Provides curated high-fidelity route profiles for Haneda (RJTT / HND) departures.
 */

import { FlightDataProvider, LivePosition } from './FlightDataProvider';
import { FlightDeparture, FlightRoute, Waypoint } from './types';
import { DEMO_ROUTES } from '../data/demoRoutes';

export class DemoFlightProvider implements FlightDataProvider {
  private routes: FlightRoute[] = DEMO_ROUTES;

  async getDepartures(): Promise<FlightDeparture[]> {
    // Keep demo times explicit so the board can be ordered like a real departure list.
    const scheduledTimes: Record<string, string> = {
      'hnd-itm': '09:30',
      'hnd-cts': '11:30',
      'hnd-fuk': '13:30',
      'hnd-oka': '14:30',
    };

    return this.routes
      .map((route, idx) => ({
        id: route.id,
        flightNumber: route.flightNumber,
        airline: route.airline,
        aircraftType: route.aircraftType,
        destinationCode: route.destination.code,
        destinationName: route.destination.name,
        destinationCity: route.destination.city,
        scheduledTime: scheduledTimes[route.id] ?? '12:30',
        gate: `${60 + idx * 2}`,
        status: 'On Time',
      }))
      .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  }

  async getRoute(routeId: string): Promise<FlightRoute> {
    const found = this.routes.find((r) => r.id === routeId);
    if (!found) {
      throw new Error(`Flight route not found: ${routeId}`);
    }
    return found;
  }

  async getLivePosition(_flightId: string): Promise<LivePosition | null> {
    // Demo implementation does not make network calls; FlightAnimator handles interpolation.
    return null;
  }

  async getFlightTrack(_flightId: string): Promise<Waypoint[] | null> {
    return null;
  }
}

