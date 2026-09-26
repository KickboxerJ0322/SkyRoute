import type { SkyRouteWeatherObservation } from './liveTypes';

const normalizeDegrees = (value: number): number => ((value % 360) + 360) % 360;

const numeric = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const findByKeys = (value: unknown, keys: Set<string>, depth = 0): number | null => {
  if (!value || typeof value !== 'object' || depth > 4) return null;
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (keys.has(key.toLowerCase())) {
      const result = numeric(child);
      if (result !== null) return result;
      if (child && typeof child === 'object') {
        const nested = child as Record<string, unknown>;
        for (const nestedKey of ['degrees', 'degree', 'value', 'direction']) {
          const nestedResult = numeric(nested[nestedKey]);
          if (nestedResult !== null) return nestedResult;
        }
      }
    }
  }
  for (const child of Object.values(record)) {
    const result = findByKeys(child, keys, depth + 1);
    if (result !== null) return result;
  }
  return null;
};

const findMetarText = (value: unknown, depth = 0): string | null => {
  if (!value || typeof value !== 'object' || depth > 4) return null;
  const record = value as Record<string, unknown>;
  for (const key of ['raw_text', 'rawtext', 'metar', 'raw', 'report']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.length >= 8) return candidate;
  }
  for (const child of Object.values(record)) {
    const result = findMetarText(child, depth + 1);
    if (result) return result;
  }
  return null;
};

/**
 * Extracts meteorological wind direction (the direction the wind comes FROM)
 * from AeroAPI's observation payload. The parser accepts common field names
 * and falls back to the METAR token, e.g. "34012KT".
 */
export const weatherWindDirection = (
  observation: SkyRouteWeatherObservation | null | undefined,
): number | null => {
  if (!observation?.raw) return null;

  const direct = findByKeys(
    observation.raw,
    new Set([
      'wind_direction',
      'winddirection',
      'wind_direction_degrees',
      'winddirectiondegrees',
      'wind_dir_degrees',
      'winddirdegrees',
      'wind_degrees',
      'winddegrees',
    ]),
  );
  if (direct !== null) return normalizeDegrees(direct);

  const metar = findMetarText(observation.raw);
  const match = metar?.match(/\b(\d{3}|VRB)\d{2,3}(?:G\d{2,3})?KT\b/i);
  if (!match || match[1].toUpperCase() === 'VRB') return null;
  return normalizeDegrees(Number(match[1]));
};
