import type { TelemetryData } from './types';
import type { RouteType } from './liveTypes';

const PHASE_LABELS: Record<TelemetryData['flightPhase'], string> = {
  Takeoff: '離陸',
  Climb: '上昇',
  Cruise: '巡航',
  Descent: '降下',
  Approach: '進入',
  Landed: '着陸',
};

export const flightPhaseLabel = (phase: TelemetryData['flightPhase']): string =>
  PHASE_LABELS[phase] ?? phase;

export const routeTypeLabel = (type: RouteType | null): string => {
  if (type === 'ACTUAL') return '実測 · ACTUAL';
  if (type === 'FILED') return '予定 · FILED';
  if (type === 'ESTIMATED') return '推定 · ESTIMATED';
  return '--';
};

export const remainingTimeLabel = (distanceKm: number, speedKmh: number): string => {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return '到着';
  const effectiveSpeed = speedKmh >= 250 ? speedKmh : 700;
  const minutes = Math.max(1, Math.round(distanceKm / effectiveSpeed * 60));
  if (minutes < 60) return `約${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `約${hours}時間${rest}分` : `約${hours}時間`;
};
