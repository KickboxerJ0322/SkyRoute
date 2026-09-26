/**
 * Preview/demo route shaping.
 *
 * Adds synthetic airport-area climb/descent manoeuvres when runway/SID/STAR
 * geometry is unavailable, then rounds fly-by waypoint corners so aircraft
 * enter turns progressively instead of snapping to a new heading.
 *
 * IMPORTANT: use this for simulated FILED/ESTIMATED/DEMO playback only.
 * Recorded ACTUAL tracks should remain untouched.
 */

import type { Airport, FlightRoute, Waypoint } from './types';
import { angleDifference, bearingBetween, distanceBetween } from '../utils/geo';

export interface RouteShapingOptions {
  departure?: boolean;
  arrival?: boolean;
  /** Meteorological wind direction: degrees the wind comes FROM. */
  departureWindDirectionDeg?: number | null;
  /** Meteorological wind direction: degrees the wind comes FROM. */
  arrivalWindDirectionDeg?: number | null;
}

const TERMINAL_RADIUS_METERS = 9000;
const TERMINAL_SWEEP_DEGREES = 240;
const TERMINAL_STEPS = 10;
const TERMINAL_TRIM_METERS = 12000;

const toRad = (deg: number): number => deg * Math.PI / 180;
const toDeg = (rad: number): number => rad * 180 / Math.PI;
const normalizeLng = (lng: number): number => ((lng + 540) % 360) - 180;
const smoothStep = (t: number): number => t * t * (3 - 2 * t);

const pointAtDistance = (
  origin: { lat: number; lng: number },
  bearingDeg: number,
  distanceMeters: number,
  altitude: number,
  name?: string,
): Waypoint => {
  const earthRadius = 6371000;
  const angularDistance = distanceMeters / earthRadius;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(origin.lat);
  const lng1 = toRad(origin.lng);

  const sinLat2 =
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing);
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );

  return {
    lat: toDeg(lat2),
    lng: normalizeLng(toDeg(lng2)),
    altitude,
    ...(name ? { name } : {}),
  };
};

const interpolateLongitude = (from: number, to: number, t: number): number => {
  const delta = ((to - from + 540) % 360) - 180;
  return normalizeLng(from + delta * t);
};

const interpolateWaypoint = (
  from: Waypoint,
  to: Waypoint,
  t: number,
  name?: string,
): Waypoint => ({
  lat: from.lat + (to.lat - from.lat) * t,
  lng: interpolateLongitude(from.lng, to.lng, t),
  altitude: from.altitude + (to.altitude - from.altitude) * t,
  ...(name ? { name } : {}),
});

const airportWaypoint = (airport: Airport, name: string): Waypoint => ({
  lat: airport.lat,
  lng: airport.lng,
  altitude: airport.altitude,
  name,
});

const firstUsefulPoint = (airport: Airport, waypoints: Waypoint[]): Waypoint =>
  waypoints.find(point => distanceBetween(airport, point) >= 25000)
  ?? waypoints.at(-1)
  ?? airportWaypoint(airport, airport.code);

const lastUsefulPoint = (airport: Airport, waypoints: Waypoint[]): Waypoint =>
  [...waypoints].reverse().find(point => distanceBetween(airport, point) >= 25000)
  ?? waypoints[0]
  ?? airportWaypoint(airport, airport.code);

const turnDirectionForBearing = (bearing: number): 1 | -1 =>
  bearing >= 180 ? -1 : 1;

const buildDepartureSpiral = (
  route: FlightRoute,
  windDirectionDeg?: number | null,
): Waypoint[] => {
  const airport = route.origin;
  const reference = firstUsefulPoint(airport, route.waypoints);
  const outboundBearing = bearingBetween(airport, reference);
  const takeoffHeading = windDirectionDeg ?? (
    outboundBearing - turnDirectionForBearing(outboundBearing) * TERMINAL_SWEEP_DEGREES
  );
  const directTurn = angleDifference(outboundBearing, takeoffHeading);
  const turnDirection: 1 | -1 = directTurn === 0
    ? turnDirectionForBearing(outboundBearing)
    : directTurn > 0 ? 1 : -1;
  const totalTurn = directTurn + turnDirection * 180;
  const cruiseEntryAltitude = Math.max(2600, airport.altitude + 2400);

  const points: Waypoint[] = [
    airportWaypoint(airport, `${airport.code} departure`),
    pointAtDistance(
      airport,
      takeoffHeading,
      900,
      airport.altitude + 90,
      windDirectionDeg == null ? 'Departure roll-out' : `Into-wind departure ${Math.round(takeoffHeading)}°`,
    ),
  ];

  for (let index = 1; index <= TERMINAL_STEPS; index += 1) {
    const t = index / TERMINAL_STEPS;
    const eased = smoothStep(t);
    const radius = 900 + (TERMINAL_RADIUS_METERS - 900) * Math.pow(t, 0.82);
    const radialBearing = takeoffHeading + totalTurn * t;
    points.push(pointAtDistance(
      airport,
      radialBearing,
      radius,
      airport.altitude + 90 + (cruiseEntryAltitude - airport.altitude - 90) * eased,
      index === TERMINAL_STEPS ? 'Departure arc exit' : undefined,
    ));
  }

  return points;
};

const buildArrivalSpiral = (
  route: FlightRoute,
  windDirectionDeg?: number | null,
): Waypoint[] => {
  const airport = route.destination;
  const reference = lastUsefulPoint(airport, route.waypoints);
  const radialStartBearing = bearingBetween(airport, reference);
  // Landing into the wind means the last inbound heading approximately matches
  // the meteorological wind direction. The radial point is therefore reciprocal.
  const finalApproachRadial = windDirectionDeg == null
    ? radialStartBearing + turnDirectionForBearing(bearingBetween(reference, airport)) * TERMINAL_SWEEP_DEGREES
    : windDirectionDeg + 180;
  const directTurn = angleDifference(finalApproachRadial, radialStartBearing);
  const turnDirection: 1 | -1 = directTurn === 0
    ? turnDirectionForBearing(bearingBetween(reference, airport))
    : directTurn > 0 ? 1 : -1;
  const totalTurn = directTurn + turnDirection * 180;
  const entryAltitude = Math.max(2600, airport.altitude + 2400);
  const points: Waypoint[] = [];

  for (let index = 0; index < TERMINAL_STEPS; index += 1) {
    const t = index / TERMINAL_STEPS;
    const eased = smoothStep(t);
    const radius = TERMINAL_RADIUS_METERS - (TERMINAL_RADIUS_METERS - 900) * Math.pow(t, 0.82);
    const radialBearing = radialStartBearing + totalTurn * t;
    points.push(pointAtDistance(
      airport,
      radialBearing,
      radius,
      entryAltitude + (airport.altitude + 90 - entryAltitude) * eased,
      index === 0 ? 'Arrival arc entry' : undefined,
    ));
  }

  points.push(pointAtDistance(
    airport,
    finalApproachRadial,
    900,
    airport.altitude + 90,
    windDirectionDeg == null ? 'Final approach' : `Into-wind final ${Math.round(windDirectionDeg)}°`,
  ));
  points.push(airportWaypoint(airport, `${airport.code} arrival`));
  return points;
};

const removeNearAirportPoints = (
  waypoints: Waypoint[],
  airport: Airport,
  fromStart: boolean,
): Waypoint[] => {
  if (fromStart) {
    const firstOutside = waypoints.findIndex(
      point => distanceBetween(point, airport) > TERMINAL_TRIM_METERS,
    );
    return firstOutside >= 0 ? waypoints.slice(firstOutside) : [];
  }

  let lastOutside = -1;
  for (let index = waypoints.length - 1; index >= 0; index -= 1) {
    if (distanceBetween(waypoints[index], airport) > TERMINAL_TRIM_METERS) {
      lastOutside = index;
      break;
    }
  }
  return lastOutside >= 0 ? waypoints.slice(0, lastOutside + 1) : [];
};

const appendDistinct = (target: Waypoint[], points: Waypoint[]): void => {
  for (const point of points) {
    const previous = target.at(-1);
    if (!previous || distanceBetween(previous, point) > 15) target.push(point);
  }
};

/**
 * Adds a synthetic expanding departure turn and/or contracting arrival turn.
 * These are visual approximations for preview/demo use where runway/SID/STAR
 * data is not available.
 */
export const withTerminalManeuvers = (
  route: FlightRoute,
  options: RouteShapingOptions = {},
): FlightRoute => {
  const departure = options.departure ?? true;
  const arrival = options.arrival ?? true;

  if (route.waypoints.length < 2 || (!departure && !arrival)) return route;

  let core = [...route.waypoints];
  if (departure) core = removeNearAirportPoints(core, route.origin, true);
  if (arrival) core = removeNearAirportPoints(core, route.destination, false);

  const waypoints: Waypoint[] = [];
  if (departure) appendDistinct(
    waypoints,
    buildDepartureSpiral(route, options.departureWindDirectionDeg),
  );
  appendDistinct(waypoints, core);
  if (arrival) appendDistinct(
    waypoints,
    buildArrivalSpiral(route, options.arrivalWindDirectionDeg),
  );

  return {
    ...route,
    waypoints: waypoints.length >= 2 ? waypoints : route.waypoints,
  };
};

const bezierWaypoint = (
  entry: Waypoint,
  control: Waypoint,
  exit: Waypoint,
  t: number,
): Waypoint => {
  const oneMinusT = 1 - t;
  const lat =
    oneMinusT * oneMinusT * entry.lat +
    2 * oneMinusT * t * control.lat +
    t * t * exit.lat;

  const controlLng = entry.lng + (((control.lng - entry.lng + 540) % 360) - 180);
  const exitLng = controlLng + (((exit.lng - controlLng + 540) % 360) - 180);
  const lng =
    oneMinusT * oneMinusT * entry.lng +
    2 * oneMinusT * t * controlLng +
    t * t * exitLng;

  return {
    lat,
    lng: normalizeLng(lng),
    altitude:
      oneMinusT * oneMinusT * entry.altitude +
      2 * oneMinusT * t * control.altitude +
      t * t * exit.altitude,
  };
};

/**
 * Replaces sharp waypoint corners with fly-by curves.
 *
 * At cruise altitude the turn begins farther before the waypoint, producing a
 * broad airliner-like arc. Near airports the radius automatically shrinks.
 */
export const smoothRouteTurns = (route: FlightRoute): FlightRoute => {
  const source = route.waypoints;
  if (source.length < 3) return route;

  const rounded: Waypoint[] = [source[0]];

  for (let index = 1; index < source.length - 1; index += 1) {
    const previous = source[index - 1];
    const current = source[index];
    const next = source[index + 1];
    const inboundDistance = distanceBetween(previous, current);
    const outboundDistance = distanceBetween(current, next);

    if (inboundDistance < 250 || outboundDistance < 250) {
      appendDistinct(rounded, [current]);
      continue;
    }

    const inboundBearing = bearingBetween(previous, current);
    const outboundBearing = bearingBetween(current, next);
    const turnAngle = Math.abs(angleDifference(outboundBearing, inboundBearing));

    if (turnAngle < 4 || turnAngle > 165) {
      appendDistinct(rounded, [current]);
      continue;
    }

    const altitudeRadius = Math.min(18000, 1800 + Math.max(0, current.altitude) * 1.25);
    const trimDistance = Math.min(
      inboundDistance * 0.28,
      outboundDistance * 0.28,
      altitudeRadius,
    );

    if (trimDistance < 180) {
      appendDistinct(rounded, [current]);
      continue;
    }

    const entry = interpolateWaypoint(
      current,
      previous,
      trimDistance / inboundDistance,
      current.name ? `${current.name} turn entry` : undefined,
    );
    const exit = interpolateWaypoint(
      current,
      next,
      trimDistance / outboundDistance,
      current.name ? `${current.name} turn exit` : undefined,
    );

    appendDistinct(rounded, [entry]);

    const samples = turnAngle > 70 ? 8 : turnAngle > 30 ? 6 : 4;
    for (let sample = 1; sample < samples; sample += 1) {
      appendDistinct(rounded, [
        bezierWaypoint(entry, current, exit, sample / samples),
      ]);
    }

    appendDistinct(rounded, [exit]);
  }

  appendDistinct(rounded, [source[source.length - 1]]);

  return {
    ...route,
    waypoints: rounded,
  };
};

/**
 * Full simulated-route preparation used by PREVIEW and DEMO.
 */
export const shapePreviewRoute = (
  route: FlightRoute,
  options: RouteShapingOptions = {},
): FlightRoute => smoothRouteTurns(withTerminalManeuvers(route, options));
