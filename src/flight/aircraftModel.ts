import { AIRCRAFT_MODEL_URL } from '../config';
import type { SkyRouteFlight } from './liveTypes';

type SupportedAirline = 'ANA' | 'JAL' | 'SKY' | 'APJ' | 'JJP' | 'SFJ';

export interface AircraftModelOption {
  url: string;
  label: string;
}

export const AIRCRAFT_MODELS: readonly AircraftModelOption[] = [
  { url: '/models/a320_ana.glb', label: 'Airbus A320 · ANA' },
  { url: '/models/a320_jetstar_japan.glb', label: 'Airbus A320 · Jetstar Japan' },
  { url: '/models/a320_peach.glb', label: 'Airbus A320 · Peach' },
  { url: '/models/a320_starflyer.glb', label: 'Airbus A320 · StarFlyer' },
  { url: '/models/a350_900_jal.glb', label: 'Airbus A350-900 · JAL' },
  { url: '/models/b737_800_ana.glb', label: 'Boeing 737-800 · ANA' },
  { url: '/models/b737_800_jal.glb', label: 'Boeing 737-800 · JAL' },
  { url: '/models/b737_800_skymark.glb', label: 'Boeing 737-800 · Skymark' },
  { url: '/models/b787_8_jal.glb', label: 'Boeing 787-8 · JAL' },
  { url: '/models/b787_9_ana.glb', label: 'Boeing 787-9 · ANA' },
  { url: '/models/skyroute_787_10.glb', label: 'Boeing 787-10 · SkyRoute' },
] as const;

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

const isA350900 = (aircraftType: string | null | undefined): boolean => {
  const type = compact(aircraftType);
  return type === 'A359' || type === 'A350900' || type === '350900' || type === 'AIRBUSA350900';
};

const isB7878 = (aircraftType: string | null | undefined): boolean => {
  const type = compact(aircraftType);
  return type === 'B788' || type === 'B7878' || type === '7878' || type === 'BOEING7878';
};

const isB7879 = (aircraftType: string | null | undefined): boolean => {
  const type = compact(aircraftType);
  return type === 'B789' || type === 'B7879' || type === '7879' || type === 'BOEING7879';
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

  if (isA350900(flight.aircraftType) && airline === 'JAL') {
    return '/models/a350_900_jal.glb';
  }

  if (isB7878(flight.aircraftType) && airline === 'JAL') {
    return '/models/b787_8_jal.glb';
  }

  if (isB7879(flight.aircraftType) && airline === 'ANA') {
    return '/models/b787_9_ana.glb';
  }

  return AIRCRAFT_MODEL_URL;
};

/** Pick one of every bundled aircraft for the API-free Haneda startup scene. */
export const randomStartupAircraftModel = (): string =>
  AIRCRAFT_MODELS[Math.floor(Math.random() * AIRCRAFT_MODELS.length)]?.url ?? AIRCRAFT_MODEL_URL;
