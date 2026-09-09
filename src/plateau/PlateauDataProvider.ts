import { CATEGORIES, type BuildingCollection, type BuildingFeature, type Ring } from './types';

function validRing(value: unknown): value is Ring {
  if (!Array.isArray(value) || value.length < 4 || value.length > 10000) return false;
  if (!value.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= 139.74 && p[0] <= 139.83 && p[1] >= 35.53 && p[1] <= 35.58)) return false;
  const first = value[0], last = value.at(-1);
  return first[0] === last[0] && first[1] === last[1] && new Set(value.map(p => p.join(','))).size >= 3;
}

export function parseBuildingCollection(value: unknown): BuildingCollection {
  const data = value as BuildingCollection;
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > 5000) throw new Error('Invalid PLATEAU GeoJSON');
  const ids = new Set<string>();
  for (const feature of data.features) {
    const p = feature?.properties, g = feature?.geometry;
    if (feature?.type !== 'Feature' || !p || typeof p.gmlId !== 'string' || !p.gmlId || ids.has(p.gmlId) || !CATEGORIES.includes(p.category)) throw new Error('Invalid PLATEAU building');
    ids.add(p.gmlId);
    for (const field of ['name', 'usage', 'majorUsage', 'usageCode', 'majorUsageCode', 'city'] as const) if (p[field] !== null && typeof p[field] !== 'string') throw new Error('Invalid PLATEAU property');
    for (const field of ['measuredHeight', 'storeysAboveGround', 'dataYear'] as const) if (p[field] !== null && (typeof p[field] !== 'number' || !Number.isFinite(p[field]) || p[field]! < 0 || p[field] === 9999)) throw new Error('Invalid PLATEAU number');
    if (!g || !['Polygon', 'MultiPolygon'].includes(g.type) || !Array.isArray(g.coordinates) || !g.coordinates.length) throw new Error('Invalid PLATEAU geometry');
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    if (!polygons.every(polygon => Array.isArray(polygon) && polygon.length > 0 && polygon.every(validRing))) throw new Error('Invalid PLATEAU polygon');
  }
  return data;
}

export class PlateauDataProvider {
  private pending: Promise<BuildingFeature[]> | null = null;
  constructor(private fetcher: typeof fetch = (...args) => fetch(...args)) {}
  load(): Promise<BuildingFeature[]> {
    if (!this.pending) this.pending = this.fetcher('/data/plateau/haneda-buildings.geojson', { signal: AbortSignal.timeout(20000) })
      .then(async response => {
        if (!response.ok) throw new Error('PLATEAU data unavailable');
        const text = await response.text();
        if (text.length > 5 * 1024 * 1024) throw new Error('PLATEAU data too large');
        return parseBuildingCollection(JSON.parse(text)).features;
      }).catch(error => { this.pending = null; throw error; });
    return this.pending;
  }
}
