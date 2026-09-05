/**
 * Google Maps 3D Initialization & Library Loader
 */

import { INITIAL_MAP_CONFIG } from '../config';

// TypeScript interfaces for Maps3D custom elements and library
export interface Maps3DLibrary {
  Map3DElement: new (options?: any) => HTMLElement & {
    center: { lat: number; lng: number; altitude: number };
    tilt: number;
    range: number;
    heading: number;
    roll?: number;
    mode: 'HYBRID' | 'SATELLITE';
    flyCameraTo: (options: { endCamera: any; durationMillis?: number }) => void;
    flyCameraAround: (options: { camera: any; durationMillis?: number; rounds?: number }) => void;
    stopCameraAnimation: () => void;
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  };
  Model3DElement: new (options?: any) => HTMLElement & {
    src: string;
    position: { lat: number; lng: number; altitude: number };
    orientation: { heading?: number; tilt?: number; roll?: number };
    scale: number;
    altitudeMode: string;
  };
  Polyline3DElement: new (options?: any) => HTMLElement & {
    coordinates: Array<{ lat: number; lng: number; altitude?: number }>;
    altitudeMode: string;
    strokeColor: string;
    strokeWidth: number;
    outerColor?: string;
    outerWidth?: number;
    extruded?: boolean;
    drawsOccludedSegments?: boolean;
    geodesic?: boolean;
  };
  AltitudeMode: {
    ABSOLUTE: string;
    CLAMP_TO_GROUND: string;
    RELATIVE_TO_GROUND: string;
    RELATIVE_TO_MESH: string;
  };
}

let maps3dLib: Maps3DLibrary | null = null;

/**
 * Injects Google Maps JavaScript API script loader.
 */
function loadGoogleMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already injected
    if ((window as any).google?.maps?.importLibrary) {
      resolve();
      return;
    }

    const loader = (g: any) => {
      let h: any;
      let a: any;
      let k: any;
      const p = 'The Google Maps JavaScript API';
      const c = 'google';
      const l = 'importLibrary';
      const q = '__ib__';
      const m = document;
      const b: any = window;
      b[c] = b[c] || {};
      const d = b[c].maps || (b[c].maps = {});
      const r = new Set();
      const e = new URLSearchParams();

      const u = () =>
        h ||
        (h = new Promise(async (f, n) => {
          await (a = m.createElement('script'));
          e.set('libraries', [...r] + '');
          for (k in g) {
            e.set(k.replace(/[A-Z]/g, (t: string) => '_' + t[0].toLowerCase()), g[k]);
          }
          e.set('callback', c + '.maps.' + q);
          a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
          d[q] = f;
          a.onerror = () => (h = n(new Error(p + ' could not load.')));
          m.head.append(a);
        }));

      d[l]
        ? console.warn(p + ' only loads once. Ignoring:', g)
        : (d[l] = (f: any, ...n: any[]) => r.add(f) && u().then(() => d[l](f, ...n)));
    };

    try {
      loader({
        key: apiKey,
        v: 'alpha',
      });
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Initializes and retrieves Maps3D library elements.
 */
export async function loadMaps3DLibrary(apiKey: string): Promise<Maps3DLibrary> {
  if (maps3dLib) {
    return maps3dLib;
  }

  if (!apiKey || apiKey === 'YOUR_GOOGLE_MAPS_API_KEY') {
    throw new Error('MISSING_API_KEY');
  }

  await loadGoogleMapsScript(apiKey);

  try {
    const lib = await (window as any).google.maps.importLibrary('maps3d');
    maps3dLib = lib as Maps3DLibrary;
    return maps3dLib;
  } catch (err: any) {
    console.error('Failed to import maps3d library:', err);
    throw new Error('MAPS3D_LOAD_FAILED: ' + (err?.message || 'Unknown error'));
  }
}

/**
 * Creates and mounts Map3DElement into container.
 */
export function createMap3DElement(
  lib: Maps3DLibrary,
  container: HTMLElement
): InstanceType<Maps3DLibrary['Map3DElement']> {
  const map = new lib.Map3DElement({
    center: { ...INITIAL_MAP_CONFIG.center },
    tilt: INITIAL_MAP_CONFIG.tilt,
    range: INITIAL_MAP_CONFIG.range,
    heading: INITIAL_MAP_CONFIG.heading,
    mode: INITIAL_MAP_CONFIG.mode,
  });

  // Ensure map fills container
  map.style.width = '100%';
  map.style.height = '100%';
  map.style.display = 'block';

  container.replaceChildren(map);
  return map;
}

