import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  stdin: {
    contents: `export { shapePreviewRoute, smoothRouteTurns, withTerminalManeuvers } from './src/flight/routeShaping';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});

const {
  shapePreviewRoute,
  smoothRouteTurns,
  withTerminalManeuvers,
} = await import(
  'data:text/javascript;base64,' +
  Buffer.from(compiled.outputFiles[0].text).toString('base64')
);

const hnd = {
  code: 'HND', icao: 'RJTT', name: 'Haneda', city: 'Tokyo',
  lat: 35.5494, lng: 139.7798, altitude: 10,
};
const itm = {
  code: 'ITM', icao: 'RJOO', name: 'Itami', city: 'Osaka',
  lat: 34.7855, lng: 135.4382, altitude: 15,
};

const baseRoute = {
  id: 'test',
  flightNumber: 'TEST1',
  airline: 'SkyRoute',
  aircraftType: 'A320',
  origin: hnd,
  destination: itm,
  durationSeconds: 3600,
  waypoints: [
    { lat: hnd.lat, lng: hnd.lng, altitude: hnd.altitude },
    { lat: 35.30, lng: 139.20, altitude: 3500 },
    { lat: 35.10, lng: 138.20, altitude: 9000 },
    { lat: 34.90, lng: 136.60, altitude: 6500 },
    { lat: itm.lat, lng: itm.lng, altitude: itm.altitude },
  ],
};

const terminal = withTerminalManeuvers(baseRoute);
assert.ok(terminal.waypoints.length > baseRoute.waypoints.length, 'terminal manoeuvres add waypoints');
assert.ok(terminal.waypoints.some(point => point.altitude > 1500), 'departure spiral climbs');
assert.equal(terminal.waypoints[0].lat, hnd.lat);
assert.equal(terminal.waypoints[0].lng, hnd.lng);
assert.ok(Math.abs(terminal.waypoints.at(-1).lat - itm.lat) < 1e-9);
assert.ok(Math.abs(terminal.waypoints.at(-1).lng - itm.lng) < 1e-9);

const cornerRoute = {
  ...baseRoute,
  waypoints: [
    { lat: 35.0, lng: 139.0, altitude: 9000 },
    { lat: 35.0, lng: 138.5, altitude: 9000 },
    { lat: 35.5, lng: 138.5, altitude: 9000 },
  ],
};
const rounded = smoothRouteTurns(cornerRoute);
assert.ok(rounded.waypoints.length > cornerRoute.waypoints.length, 'sharp corner becomes a multi-point curve');

const shaped = shapePreviewRoute(baseRoute);
assert.ok(shaped.waypoints.length > terminal.waypoints.length, 'terminal path also receives smooth fly-by turns');

console.log('Passed: preview route terminal spirals and rounded fly-by turns.');
