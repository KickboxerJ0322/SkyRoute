/**
 * SkyRoute Application Entry Point
 * Orchestrates Google Photorealistic 3D Maps, Boeing 787-10 model, flight telemetry, and UI.
 */

import {
  AIRCRAFT_MODEL_URL,
  AIRCRAFT_SCALE_NORMAL,
  AIRCRAFT_SCALE_OVERVIEW,
  DEFAULT_PLAYBACK_SPEED,
} from './config';
import { loadMaps3DLibrary, createMap3DElement } from './map/initMap3D';
import { AircraftController } from './map/AircraftController';
import { RouteRenderer } from './map/RouteRenderer';
import { CameraController } from './map/CameraController';
import { DemoFlightProvider } from './flight/DemoFlightProvider';
import { FlightAnimator } from './flight/FlightAnimator';
import { FlightPanel } from './ui/FlightPanel';
import { FlightInfo } from './ui/FlightInfo';
import { PlaybackControls } from './ui/PlaybackControls';
import { PanelVisibility } from './ui/PanelVisibility';
import { MapControls } from './ui/MapControls';
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

  // 6. Initialize Flight Data & Animator
  const flightProvider = new DemoFlightProvider();
  const departures = await flightProvider.getDepartures();
  const initialRouteId = departures[0]?.id || 'hnd-cts';
  const initialRoute = await flightProvider.getRoute(initialRouteId);

  // 7. Setup UI Components
  const flightPanelRoot = document.getElementById('flight-panel-root');
  const flightInfoRoot = document.getElementById('flight-info-root');
  const playbackRoot = document.getElementById('playback-container');
  const mapControlsRoot = document.getElementById('map-controls-container');

  if (!flightPanelRoot || !flightInfoRoot || !playbackRoot || !mapControlsRoot) {
    throw new Error('UI root elements not found.');
  }

  const flightInfo = new FlightInfo(flightInfoRoot);
  flightInfo.setRoute(initialRoute);

  let playbackControls: PlaybackControls;

  const animator = new FlightAnimator((telemetry) => {
    // Synchronize aircraft 3D model
    aircraft.update(telemetry);

    // Synchronize camera tracking in FOLLOW mode
    cameraController.update(telemetry);

    // Update real-time telemetry HUD
    flightInfo.updateTelemetry(telemetry);

    // Update seek progress slider
    playbackControls.setProgress(telemetry.progress);
    playbackControls.setPlayingState(animator.getIsPlaying(), animator.getDirection());
  });

  playbackControls = new PlaybackControls(playbackRoot, {
    onTogglePlay: () => {
      const playing = animator.togglePlay();
      playbackControls.setPlayingState(playing, 1);
    },
    onToggleReverse: () => {
      const revPlaying = animator.toggleReverse();
      playbackControls.setPlayingState(revPlaying, -1);
    },
    onRestart: () => {
      animator.restart();
      playbackControls.setPlayingState(true, 1);
    },
    onSpeedChange: (speed) => {
      animator.setSpeed(speed);
    },
    onSeek: (progress) => {
      animator.seek(progress);
    },
  });

  const flightPanel = new FlightPanel(flightPanelRoot);

  const mapControls = new MapControls(mapControlsRoot, {
    onMapModeChange: (mode) => {
      map.mode = mode;
    },
    onCameraModeChange: (camMode) => {
      cameraController.setMode(camMode);
      cameraController.update(animator.calculateTelemetryAt(animator.getProgress()));
      if (camMode === 'OVERVIEW') {
        aircraft.setScale(AIRCRAFT_SCALE_OVERVIEW);
      } else {
        aircraft.setScale(AIRCRAFT_SCALE_NORMAL);
      }
    },
    onOpenMobileDepartures: () => {
      flightPanel.toggleMobileDrawer();
    },
    onOffsetChange: (deltaDeg) => {
      cameraController.setHeadingOffset(deltaDeg);
      cameraController.update(animator.calculateTelemetryAt(animator.getProgress()));
    },
    onTiltChange: (deltaDeg) => {
      cameraController.setTilt(deltaDeg);
      cameraController.update(animator.calculateTelemetryAt(animator.getProgress()));
    },
  });

  new PanelVisibility();

  // Camera mode change sync
  cameraController.onModeChange((mode) => {
    mapControls.setCameraMode(mode);
    if (mode === 'OVERVIEW') {
      aircraft.setScale(AIRCRAFT_SCALE_OVERVIEW);
    } else {
      aircraft.setScale(AIRCRAFT_SCALE_NORMAL);
    }
  });

  // 8. Route Selection Handler
  async function selectRoute(routeId: string): Promise<void> {
    const route = await flightProvider.getRoute(routeId);

    // Update 3D aerial path
    routeRenderer.setRoute(route.waypoints);

    // Update camera target
    cameraController.setRoute(route);

    // Update HUD display
    flightInfo.setRoute(route);

    // Reset and start flight trajectory
    animator.setRoute(route);
    playbackControls.setPlayingState(true);
    animator.play();
  }

  flightPanel.setDepartures(departures, initialRouteId);
  flightPanel.onSelect((id) => {
    selectRoute(id);
  });

  // 9. Load initial route and start demonstration
  routeRenderer.setRoute(initialRoute.waypoints);
  cameraController.setRoute(initialRoute);
  animator.setRoute(initialRoute);

  // Start at the configured default speed
  animator.setSpeed(DEFAULT_PLAYBACK_SPEED);
  playbackControls.setSpeed(DEFAULT_PLAYBACK_SPEED);

  // Ready! Dismiss loading screen and begin flight
  loading.hide();
  animator.play();
  playbackControls.setPlayingState(true);

  console.log('SkyRoute initialized successfully.');
}

// Start application on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initSkyRoute().catch((err) => console.error('Initialization error:', err));
  });
} else {
  initSkyRoute().catch((err) => console.error('Initialization error:', err));
}
