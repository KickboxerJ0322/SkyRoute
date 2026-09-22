import { AIRCRAFT_MODEL_URL } from '../config';
import type { SkyRouteFlight } from './liveTypes';

const B738_MODELS = {
  ANA: '/models/b737_800_ana.glb',
  JAL: '/models/b737_800_jal.glb',
  SKY: '/models/b737_800_skymark.glb',
} as const;

type SupportedB738Airline = keyof typeof B738_MODELS;

const compact = (value: string | null | undefined): string =>
  (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const isB737800 = (aircraftType: string | null | undefined): boolean => {
  const type = compact(aircraftType);
  return type === 'B738' || type === 'B737800' || type === '737800' || type === 'BOEING737800';
};

const airlineFromFlight = (flight: SkyRouteFlight): SupportedB738Airline | null => {
  const operator = compact(flight.operator);
  if (operator === 'ANA' || operator.includes('ALLNIPPON')) return 'ANA';
  if (operator === 'JAL' || operator.includes('JAPANAIRLINES')) return 'JAL';
  if (operator === 'SKY' || operator.includes('SKYMARK')) return 'SKY';

  const primaryIds = [flight.ident, flight.callsign, flight.flightNumber].map(compact);
  if (primaryIds.some(value => value.startsWith('ANA'))) return 'ANA';
  if (primaryIds.some(value => value.startsWith('JAL'))) return 'JAL';
  if (primaryIds.some(value => value.startsWith('SKY'))) return 'SKY';

  const codeshares = (flight.codeshares ?? []).map(compact);
  if (codeshares.some(value => value.startsWith('ANA'))) return 'ANA';
  if (codeshares.some(value => value.startsWith('JAL'))) return 'JAL';
  if (codeshares.some(value => value.startsWith('SKY'))) return 'SKY';

  return null;
};

export const aircraftModelUrlForFlight = (flight: SkyRouteFlight | null): string => {
  if (!flight || !isB737800(flight.aircraftType)) return AIRCRAFT_MODEL_URL;
  const airline = airlineFromFlight(flight);
  return airline ? B738_MODELS[airline] : AIRCRAFT_MODEL_URL;
};
