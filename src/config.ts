/**
 * SkyRoute Configuration & Constants
 */

// Baseline Model Calibration
// As verified by user testing: heading -90° and tilt 270° achieves the exact forward, upright orientation.
// Internally baked in as baseline so 0°/0° is standard.
export const MODEL_HEADING_OFFSET_DEG = -90;
export const MODEL_TILT_OFFSET_DEG = 270;
export const MODEL_ROLL_OFFSET_DEG = 0;

export const AIRCRAFT_MODEL_URL = '/models/skyroute_787_10.glb';
export const AIRCRAFT_SCALE_NORMAL = 1.0;
export const AIRCRAFT_SCALE_OVERVIEW = 800.0; // Exaggerated overview symbol size for long routes

// Initial Airport: Haneda Airport (RJTT / HND)
export const HANEDA_AIRPORT = {
  code: 'HND',
  icao: 'RJTT',
  name: '東京国際空港（羽田）',
  city: 'Tokyo / Haneda',
  lat: 35.5494,
  lng: 139.7798,
  altitude: 10,
};

// Initial Map & Camera Settings
export const INITIAL_MAP_CONFIG = {
  center: {
    lat: 35.5494,
    lng: 139.7798,
    altitude: 10,
  },
  // Low, close establishing shot of Haneda with the parked 787 visible on the apron.
  tilt: 72,
  range: 2600,
  heading: 330,
  mode: 'HYBRID' as 'HYBRID' | 'SATELLITE',
};

// Camera Presets
export const CAMERA_PRESETS = {
  CLOSE: {
    name: 'CLOSE',
    range: 65,   // Close behind the tail/engines (same scale intimacy as cockpit)
    tilt: 78,
    headingLag: 0.18,
    positionLag: 0.22,
  },
  FOLLOW: {
    name: 'FOLLOW',
    range: 360,  // Keep the aircraft clearly visible while preserving a chase-camera view
    tilt: 74,
    headingLag: 0.10,
    positionLag: 0.18,
  },
  COCKPIT: {
    name: 'COCKPIT',
    range: 20,   // Pilot perspective right at the nose windscreen looking forward
    tilt: 84,
    headingLag: 0.35,
    positionLag: 0.35,
  },
};

// Playback: 1x means roughly a normal jet cruise speed.
// Route playback duration is derived from route distance at this speed,
// so short replay tracks and long routes move at a consistent physical pace.
export const BASE_PLAYBACK_SPEED_KMH = 900;
export const DEFAULT_PLAYBACK_SPEED = 1;
export const MIN_PLAYBACK_SPEED = 0.2;
export const MAX_PLAYBACK_SPEED = 50;
export const PLAYBACK_SPEED_PRESETS = [0.2, 1, 3, 10, 50] as const;

