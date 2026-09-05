/**
 * Geographic & Geodesic Utilities
 */

import { lerp } from './interpolation';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface LatLngAltPoint extends LatLngPoint {
  altitude: number;
}

const EARTH_RADIUS_METERS = 6371000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Calculates great-circle distance between two coordinates in meters (Haversine).
 */
export function distanceBetween(p1: LatLngPoint, p2: LatLngPoint): number {
  const phi1 = p1.lat * DEG_TO_RAD;
  const phi2 = p2.lat * DEG_TO_RAD;
  const deltaPhi = (p2.lat - p1.lat) * DEG_TO_RAD;
  const deltaLambda = (p2.lng - p1.lng) * DEG_TO_RAD;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Calculates initial bearing from p1 to p2 in degrees [0, 360).
 * 0° = North, 90° = East, 180° = South, 270° = West.
 */
export function bearingBetween(p1: LatLngPoint, p2: LatLngPoint): number {
  const phi1 = p1.lat * DEG_TO_RAD;
  const phi2 = p2.lat * DEG_TO_RAD;
  const deltaLambda = (p2.lng - p1.lng) * DEG_TO_RAD;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return (theta * RAD_TO_DEG + 360) % 360;
}

/**
 * Linearly interpolates between two LatLng points with spherical consideration.
 */
export function interpolateLatLng(p1: LatLngPoint, p2: LatLngPoint, t: number): LatLngPoint {
  return {
    lat: lerp(p1.lat, p2.lat, t),
    lng: lerp(p1.lng, p2.lng, t),
  };
}

/**
 * Interpolates altitude in meters between alt1 and alt2.
 */
export function interpolateAltitude(alt1: number, alt2: number, t: number): number {
  return lerp(alt1, alt2, t);
}

/**
 * Normalizes any degree value to [0, 360).
 */
export function normalizeHeading(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Computes shortest signed angle difference between target and current in degrees [-180, 180].
 * Positive means target is clockwise (turn right), negative means turn left.
 */
export function angleDifference(targetDeg: number, currentDeg: number): number {
  return ((targetDeg - currentDeg + 540) % 360) - 180;
}

