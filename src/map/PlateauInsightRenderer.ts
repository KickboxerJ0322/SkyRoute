import type { Maps3DLibrary } from './initMap3D';
import { CATEGORY_COLORS, type BuildingFeature, type BuildingCategory } from '../plateau/types';
import { HANEDA_AIRPORT } from '../config';

type Polygon = InstanceType<Maps3DLibrary['Polygon3DInteractiveElement']>;
export const MAX_INSIGHT_BUILDINGS = 400;
export class PlateauInsightRenderer {
  private entries: { polygon: Polygon; feature: BuildingFeature }[] = [];
  private revision = 0;
  constructor(private lib: Maps3DLibrary, private map: HTMLElement, private onSelect: (feature: BuildingFeature) => void) {}
  clear() { this.revision++; this.entries.forEach(e => e.polygon.remove()); this.entries = []; }
  select(id: string | null) {
    this.entries.forEach(({ polygon, feature }) => {
      const selected = feature.properties.gmlId === id;
      polygon.strokeWidth = selected ? 4 : 1.5;
      polygon.fillColor = CATEGORY_COLORS[feature.properties.category] + (selected ? '59' : '40');
    });
  }
  async render(features: BuildingFeature[], categories: Set<BuildingCategory>): Promise<number> {
    this.clear(); const revision = this.revision;
    if (!this.lib.Polygon3DInteractiveElement || !this.lib.AltitudeMode.RELATIVE_TO_MESH) throw new Error('Interactive 3D polygons unavailable');
    const distance = (f: BuildingFeature) => {
      const p = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0][0] : f.geometry.coordinates[0][0][0];
      return (p[0] - HANEDA_AIRPORT.lng) ** 2 * .66 + (p[1] - HANEDA_AIRPORT.lat) ** 2;
    };
    const visible = features.filter(f => categories.has(f.properties.category)).sort((a, b) => distance(a) - distance(b)).slice(0, MAX_INSIGHT_BUILDINGS);
    let count = 0, vertices = 0;
    for (const feature of visible) {
      if (revision !== this.revision) return 0;
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      const size = polygons.reduce((sum, rings) => sum + rings.reduce((s, ring) => s + ring.length, 0), 0);
      if (vertices + size > 50000 || this.entries.length + polygons.length > 750) continue;
      vertices += size;
      for (const rings of polygons) {
        const polygon = new this.lib.Polygon3DInteractiveElement({
          altitudeMode: this.lib.AltitudeMode.RELATIVE_TO_MESH, extruded: false, autofitsCamera: false,
          fillColor: CATEGORY_COLORS[feature.properties.category] + '40', strokeColor: CATEGORY_COLORS[feature.properties.category] + 'c0',
          strokeWidth: 1.5, drawsOccludedSegments: false,
        });
        const coordinates = (ring: typeof rings[number]) => ring.slice(0, -1).map(([lng, lat]) => ({ lat, lng, altitude: 1.5 }));
        polygon.path = coordinates(rings[0]);
        // Maps3D rejects an empty innerPaths iterable: omit it when there are no holes.
        if (rings.length > 1) polygon.innerPaths = rings.slice(1).map(coordinates);
        polygon.dataset.plateauId = feature.properties.gmlId;
        polygon.addEventListener('gmp-click', () => { this.select(feature.properties.gmlId); this.onSelect(feature); });
        this.entries.push({ polygon, feature }); this.map.append(polygon);
      }
      count++;
      if (count % 20 === 0) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    return count;
  }
}
