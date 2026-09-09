import './styles/plateau.css';
import { FlightExperience } from './flight/FlightExperience';
import { mountPlateauInsight } from './plateau/PlateauInsight';
/**
 * SkyRoute Application Entry Point
 * Orchestrates Google Photorealistic 3D Maps, Boeing 787-10 model, flight telemetry, and UI.
 */

import { AIRCRAFT_MODEL_URL } from './config';
import { loadMaps3DLibrary, createMap3DElement } from './map/initMap3D';
import { AircraftController } from './map/AircraftController';
import { RouteRenderer } from './map/RouteRenderer';
import { CameraController } from './map/CameraController';
import { LoadingOverlay } from './ui/LoadingOverlay';
import { ErrorOverlay } from './ui/ErrorOverlay';

async function initSkyRoute(): Promise<void> {
  const loading = new LoadingOverlay();

  // 1. Validate Google Maps API Key
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GOOGLE_MAPS_API_KEY' || apiKey.trim() === '') {
    loading.hide();
    ErrorOverlay.showMissingKey();
    return;
  }

  // 2. Test GLB Asset HTTP 200 accessibility
  loading.updateStatus('Verifying Boeing 787-10 3D Model...');
  try {
    const glbCheck = await fetch(AIRCRAFT_MODEL_URL, { method: 'HEAD' });
    if (!glbCheck.ok) {
      loading.hide();
      ErrorOverlay.showGLBError(AIRCRAFT_MODEL_URL);
      return;
    }
  } catch (e) {
    console.warn('GLB HEAD check failed, attempting direct load:', e);
  }

  // 3. Load Google Maps 3D Library
  loading.updateStatus('Loading Photorealistic 3D Maps...');
  let maps3dLib;
  try {
    maps3dLib = await loadMaps3DLibrary(apiKey);
  } catch (err: any) {
    loading.hide();
    const overlay = new ErrorOverlay();
    overlay.showError({
      type: 'MAPS_LOAD_FAILED',
      title: 'Google Maps 3D Load Failure',
      message: err?.message || 'Failed to load Google Maps 3D JavaScript API.',
      remedy: 'APIキーの権限 (Maps JavaScript API & 3D Map Tiles) とネットワーク接続を確認してください。',
    });
    return;
  }

  // 4. Initialize Map3DElement
  const mapContainer = document.getElementById('map-container');
  if (!mapContainer) {
    throw new Error('Map container element not found.');
  }

  const map = createMap3DElement(maps3dLib, mapContainer);

  // 5. Initialize Map Subsystems
  loading.updateStatus('Initializing Aircraft Model & Flight Path...');
  const aircraft = new AircraftController(maps3dLib, map);
  const routeRenderer = new RouteRenderer(maps3dLib, map);
  const cameraController = new CameraController(map);

  const actualTrackRenderer = new RouteRenderer(maps3dLib, map);
  const experience = new FlightExperience(aircraft, cameraController, routeRenderer, actualTrackRenderer, map);
  mountPlateauInsight(maps3dLib, map);
  loading.hide();
  await experience.start();
}

// Start application on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initSkyRoute().catch((err) => console.error('Initialization error:', err));
  });
} else {
  initSkyRoute().catch((err) => console.error('Initialization error:', err));
}
