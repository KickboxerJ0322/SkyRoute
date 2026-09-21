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
import { LoadingOverlay } from './ui/LoadingOverlay';
import { ErrorOverlay } from './ui/ErrorOverlay';
import { SkyFinder } from './ui/SkyFinder';
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
  const finderAircraft = new AircraftController(maps3dLib, map);
  finderAircraft.setVisible(false);
  const routeRenderer = new RouteRenderer(maps3dLib, map);
  const cameraController = new CameraController(map);

  const actualTrackRenderer = new RouteRenderer(maps3dLib, map);
  const experience = new FlightExperience(aircraft, cameraController, routeRenderer, actualTrackRenderer, map);
  const skyFinderRoot = document.getElementById('sky-finder-root');
  if (!skyFinderRoot) throw new Error('Sky Finder root not found.');
  const skyFinder = new SkyFinder(skyFinderRoot, map, finderAircraft, flight => {
    skyFinder.setVisible(false);
    finderAircraft.setVisible(false);
    const leftPanel = document.getElementById('left-panel-container');
    const flightPanel = document.getElementById('flight-panel-root');
    const flightInfo = document.getElementById('flight-info-root');
    if (leftPanel) leftPanel.hidden = false;
    if (flightPanel) flightPanel.hidden = true;
    if (flightInfo) flightInfo.hidden = false;
    void experience.inspectLiveFlight(flight);
  });

  const homeButton = document.getElementById('app-home');
  const routeButton = document.getElementById('mode-route');
  const finderButton = document.getElementById('mode-finder');
  const infoButton = document.getElementById('mode-info');
  const leftPanel = document.getElementById('left-panel-container');
  const playback = document.getElementById('playback-container');
  const mapControls = document.getElementById('map-controls-container');
  const infoRoot = document.getElementById('info-root');
  if (!infoRoot) throw new Error('Info root not found.');
  const infoView = new InfoView(infoRoot);

  let routeCameraMode = cameraController.getMode();
  const setMode = (mode: 'ROUTE' | 'FINDER' | 'INFO') => {
    const finder = mode === 'FINDER';
    const info = mode === 'INFO';
    routeButton?.classList.toggle('active', mode === 'ROUTE');
    finderButton?.classList.toggle('active', finder);
    infoButton?.classList.toggle('active', info);

    if (leftPanel) leftPanel.hidden = finder || info;
    if (playback) playback.hidden = finder || info;
    if (mapControls) mapControls.hidden = info;
    aircraft.setVisible(mode === 'ROUTE');
    skyFinder.setVisible(finder);
    if (info) void infoView.show(); else infoView.hide();

    const flightPanel = document.getElementById('flight-panel-root');
    const flightInfo = document.getElementById('flight-info-root');
    if (mode === 'ROUTE') {
      if (flightPanel) flightPanel.hidden = false;
      if (flightInfo) flightInfo.hidden = false;
      finderAircraft.setVisible(false);
      cameraController.setMode(routeCameraMode);
    } else if (finder) {
      routeCameraMode = cameraController.getMode() === 'FREE' ? routeCameraMode : cameraController.getMode();
      cameraController.setMode('FREE');
    } else {
      finderAircraft.setVisible(false);
    }
  };

  homeButton?.addEventListener('click', () => setMode('ROUTE'));
  routeButton?.addEventListener('click', () => setMode('ROUTE'));
  finderButton?.addEventListener('click', () => setMode('FINDER'));
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
