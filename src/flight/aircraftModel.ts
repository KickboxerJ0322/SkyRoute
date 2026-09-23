import { AIRCRAFT_MODEL_URL } from '../config';
import type { SkyRouteFlight } from './liveTypes';

type SupportedAirline = 'ANA' | 'JAL' | 'SKY' | 'APJ' | 'JJP' | 'SFJ';

const B738_MODELS: Partial<Record<SupportedAirline, string>> = {
  ANA: '/models/b737_800_ana.glb',
  JAL: '/models/b737_800_jal.glb',
  SKY: '/models/b737_800_skymark.glb',
};

const A320_MODELS: Partial<Record<SupportedAirline, string>> = {
  ANA: '/models/a320_ana.glb',
  APJ: '/models/a320_peach.glb',
  JJP: '/models/a320_jetstar_japan.glb',
  SFJ: '/models/a320_starflyer.glb',
};

const compact = (value: string | null | undefined): string =>
  (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const isB737800 = (aircraftType: string | null | undefined): boolean => {
  const type = compact(aircraftType);
  return type === 'B738' || type === 'B737800' || type === '737800' || type === 'BOEING737800';
};

const isA320Ceo = (aircraftType: string | null | undefined): boolean => {
  const type = compact(aircraftType);
  return type === 'A320'
    || type.startsWith('A3202')
    || type === 'AIRBUSA320'
    || type.startsWith('AIRBUSA3202');
};

const airlineFromFlight = (flight: SkyRouteFlight): SupportedAirline | null => {
  const operator = compact(flight.operator);
  if (operator === 'ANA' || operator.includes('ALLNIPPON')) return 'ANA';
  if (operator === 'JAL' || operator.includes('JAPANAIRLINES')) return 'JAL';
  if (operator === 'SKY' || operator.includes('SKYMARK')) return 'SKY';
  if (operator === 'APJ' || operator.includes('PEACH')) return 'APJ';
  if (operator === 'JJP' || operator.includes('JETSTARJAPAN')) return 'JJP';
  if (operator === 'SFJ' || operator.includes('STARFLYER')) return 'SFJ';

  const primaryIds = [flight.ident, flight.callsign, flight.flightNumber].map(compact);
  if (primaryIds.some(value => value.startsWith('ANA'))) return 'ANA';
  if (primaryIds.some(value => value.startsWith('JAL'))) return 'JAL';
  if (primaryIds.some(value => value.startsWith('SKY'))) return 'SKY';
  if (primaryIds.some(value => value.startsWith('APJ'))) return 'APJ';
  if (primaryIds.some(value => value.startsWith('JJP'))) return 'JJP';
  if (primaryIds.some(value => value.startsWith('SFJ'))) return 'SFJ';

  const codeshares = (flight.codeshares ?? []).map(compact);
  if (codeshares.some(value => value.startsWith('ANA'))) return 'ANA';
  if (codeshares.some(value => value.startsWith('JAL'))) return 'JAL';
  if (codeshares.some(value => value.startsWith('SKY'))) return 'SKY';
  if (codeshares.some(value => value.startsWith('APJ'))) return 'APJ';
  if (codeshares.some(value => value.startsWith('JJP'))) return 'JJP';
  if (codeshares.some(value => value.startsWith('SFJ'))) return 'SFJ';

  return null;
};

export const aircraftModelUrlForFlight = (flight: SkyRouteFlight | null): string => {
  if (!flight) return AIRCRAFT_MODEL_URL;

  const airline = airlineFromFlight(flight);
  if (!airline) return AIRCRAFT_MODEL_URL;

  if (isB737800(flight.aircraftType)) {
    return B738_MODELS[airline] ?? AIRCRAFT_MODEL_URL;
  }

  if (isA320Ceo(flight.aircraftType)) {
    return A320_MODELS[airline] ?? AIRCRAFT_MODEL_URL;
  }

  return AIRCRAFT_MODEL_URL;
};


const STARTUP_MODELS = [
  '/models/b737_800_ana.glb',
  '/models/b737_800_jal.glb',
  '/models/b737_800_skymark.glb',
  '/models/skyroute_787_10.glb',
] as const;

/** Pick one of the bundled aircraft for the API-free Haneda startup scene. */
export const randomStartupAircraftModel = (): string =>
  STARTUP_MODELS[Math.floor(Math.random() * STARTUP_MODELS.length)];
