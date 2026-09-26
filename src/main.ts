import './styles/modes.css';
import { FlightExperience } from './flight/FlightExperience';
/**
 * SkyRoute Application Entry Point
 * Orchestrates Google Photorealistic 3D Maps, Boeing 787-10 model, flight telemetry, and UI.
 */

import { AIRCRAFT_MODEL_URL } from './config';
import { loadMaps3DLibrary, createMap3DElement } from './map/initMap3D';
import { AircraftController } from './map/AircraftController';
import { RouteRenderer } from './map/RouteRenderer';
import { CameraController } from './map/CameraController';
import { SigmetLayer } from './map/SigmetLayer';
import { LoadingOverlay } from './ui/LoadingOverlay';
import { ErrorOverlay } from './ui/ErrorOverlay';
import { InfoView } from './ui/InfoView';

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
  const plannedRoute = new RouteRenderer(maps3dLib, map);
  const actualRoute = new RouteRenderer(maps3dLib, map);
  const cameraController = new CameraController(map);
  const sigmetLayer = new SigmetLayer(maps3dLib, map);
  const experience = new FlightExperience(aircraft, cameraController, plannedRoute, actualRoute, sigmetLayer, map);
  const homeButton = document.getElementById('app-home');
  const routeButton = document.getElementById('mode-route');
  const infoButton = document.getElementById('mode-info');
  const leftPanel = document.getElementById('left-panel-container');
  const playback = document.getElementById('playback-container');
  const mapControls = document.getElementById('map-controls-container');
  const infoRoot = document.getElementById('info-root');
  if (!infoRoot) throw new Error('Info root not found.');
  const infoView = new InfoView(infoRoot);

  const setMode = (mode: 'ROUTE' | 'INFO') => {
    const info = mode === 'INFO';
    routeButton?.classList.toggle('active', mode === 'ROUTE');
    infoButton?.classList.toggle('active', info);

    if (leftPanel) leftPanel.hidden = info;
    if (playback) playback.hidden = info;
    if (mapControls) mapControls.hidden = info;
    aircraft.setVisible(mode === 'ROUTE');
    if (info) void infoView.show(); else infoView.hide();

    const flightPanel = document.getElementById('flight-panel-root');
    const flightInfo = document.getElementById('flight-info-root');
    if (mode === 'ROUTE') {
      if (flightPanel) flightPanel.hidden = false;
      if (flightInfo) flightInfo.hidden = false;
    }
  };

  homeButton?.addEventListener('click', () => setMode('ROUTE'));
  routeButton?.addEventListener('click', () => setMode('ROUTE'));
  infoButton?.addEventListener('click', () => setMode('INFO'));
  setMode('ROUTE');

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
