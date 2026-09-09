export const CATEGORIES = ['PUBLIC_TRANSPORT', 'COMMERCIAL', 'MEDICAL', 'OTHER'] as const;
export type BuildingCategory = typeof CATEGORIES[number];
export type Ring = [number, number][];
export interface BuildingProperties {
  gmlId: string;
  name: string | null;
  usage: string | null;
  majorUsage: string | null;
  usageCode: string | null;
  majorUsageCode: string | null;
  measuredHeight: number | null;
  storeysAboveGround: number | null;
  category: BuildingCategory;
  city: string | null;
  dataYear: number | null;
}
export interface BuildingFeature {
  type: 'Feature';
  properties: BuildingProperties;
  geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
}
export interface BuildingCollection { type: 'FeatureCollection'; features: BuildingFeature[] }
export const CATEGORY_LABELS: Record<BuildingCategory, string> = {
  PUBLIC_TRANSPORT: '公共・交通', COMMERCIAL: '商業', MEDICAL: '医療', OTHER: 'その他',
};
export const CATEGORY_COLORS: Record<BuildingCategory, string> = {
  PUBLIC_TRANSPORT: '#399dff', COMMERCIAL: '#ffcb48', MEDICAL: '#bd83ff', OTHER: '#a0a8b6',
};
