/**
 * Camera Controller
 * Manages camera modes (FOLLOW, OVERVIEW, FREE) and smooth flight-following interpolation.
 */

import { CAMERA_PRESETS, INITIAL_MAP_CONFIG } from '../config';
import { TelemetryData, FlightRoute } from '../flight/types';
import { lerp, lerpAngle, clamp } from '../utils/interpolation';

export type CameraMode = 'CLOSE' | 'FOLLOW' | 'COCKPIT' | 'OVERVIEW' | 'FREE';

export class CameraController {
  private mode: CameraMode = 'CLOSE'; // Default to close chase so aircraft is immediately clear
  private map: any = null;

  // Smoothed camera state
  private smoothCenter = { lat: 35.5494, lng: 139.7798, altitude: 1000 };
  private smoothHeading = 340;
  private smoothTilt = 78;
  private smoothRange = 220;
  private isInitialized = false;

  private headingOffset = 0;
  private tiltOverride: number | null = null;

  private activeRoute: FlightRoute | null = null;
  private onModeChangeCallback: ((mode: CameraMode) => void) | null = null;

  constructor(map: any) {
    this.map = map;
  }

  public setRoute(route: FlightRoute): void {
    this.activeRoute = route;
    this.isInitialized = false;
    if (this.mode === 'OVERVIEW') {
      this.applyOverviewView();
    }
  }

  public setMode(newMode: CameraMode): void {
    if (this.mode === newMode) return;
    this.map?.stopCameraAnimation?.();
    this.mode = newMode;

    if (this.mode === 'FREE') {
      if (this.map?.stopCameraAnimation) {
        this.map.stopCameraAnimation();
      }
    } else if (this.mode === 'OVERVIEW') {
      this.applyOverviewView();
    } else {
      // Re-initialize smooth tracking for newly selected follow mode
      this.isInitialized = false;
    }

    if (this.onModeChangeCallback) {
      this.onModeChangeCallback(this.mode);
    }
  }

  public setHeadingOffset(degrees: number): void {
    const delta = degrees - this.headingOffset;
    this.headingOffset = degrees;
    this.map?.stopCameraAnimation?.();
    if (this.mode === 'FREE' || this.mode === 'OVERVIEW') {
      this.map.heading = ((this.map.heading + delta) % 360 + 360) % 360;
    }
    this.isInitialized = false;
  }

  public setTilt(degrees: number): void {
    this.tiltOverride = degrees < 0 ? null : clamp(degrees, 0, 90);
    this.map?.stopCameraAnimation?.();
    if (this.mode === 'FREE' || this.mode === 'OVERVIEW') {
      this.map.tilt = this.tiltOverride ?? (this.mode === 'OVERVIEW' ? 35 : 78);
    }
    this.isInitialized = false;
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public onModeChange(cb: (mode: CameraMode) => void): void {
    this.onModeChangeCallback = cb;
  }

  /**
   * Called on every telemetry tick to update camera in CLOSE, FOLLOW, or COCKPIT modes.
   */
  public update(telemetry: TelemetryData): void {
    if (this.mode === 'FREE' || this.mode === 'OVERVIEW' || !this.map) {
      return;
    }

    let targetRange = CAMERA_PRESETS.FOLLOW.range;
    let targetTilt = CAMERA_PRESETS.FOLLOW.tilt;
    let targetCenter = {
      lat: telemetry.lat,
      lng: telemetry.lng,
      altitude: telemetry.altitude + 15,
    };
    let targetHeading = telemetry.heading;
    let posLag = CAMERA_PRESETS.FOLLOW.positionLag;
    let headingLag = CAMERA_PRESETS.FOLLOW.headingLag;

    if (this.mode === 'CLOSE') {
      // Intimate view right behind the tail & engines
      targetRange = CAMERA_PRESETS.CLOSE.range;
      targetTilt = 78;
      targetCenter = {
        lat: telemetry.lat,
        lng: telemetry.lng,
        altitude: telemetry.altitude + 6,
      };
      posLag = 1;
      headingLag = 1;
    } else if (this.mode === 'COCKPIT') {
      // True pilot perspective positioned right at the nose windscreen looking forward
      targetRange = CAMERA_PRESETS.COCKPIT.range; // Camera offset from focal point
      targetTilt = clamp(90 + telemetry.pitch, 65, 105);

      // Model nose is ~35m forward from model origin.
      // Keep the eye 40m ahead of origin, just beyond the nose, without tracking lag.
      const rad = (telemetry.heading * Math.PI) / 180;
      const forwardMeters = 40 + targetRange * Math.sin(targetTilt * Math.PI / 180);
      const dLat = (forwardMeters * Math.cos(rad)) / 111320;
      const dLng =
        (forwardMeters * Math.sin(rad)) / (111320 * Math.cos((telemetry.lat * Math.PI) / 180));

      targetCenter = {
        lat: telemetry.lat + dLat,
        lng: telemetry.lng + dLng,
        altitude: telemetry.altitude + 7.5 - targetRange * Math.cos(targetTilt * Math.PI / 180),
      };
      posLag = 1;
      headingLag = 1;
    }

    targetHeading = ((targetHeading + this.headingOffset) % 360 + 360) % 360;
    targetTilt = this.tiltOverride ?? targetTilt;

    // Initialize instantly on mode change / first tick
    if (!this.isInitialized) {
      this.smoothCenter = { ...targetCenter };
      this.smoothHeading = targetHeading;
      this.smoothTilt = targetTilt;
      this.smoothRange = targetRange;
      this.isInitialized = true;
    }

    // Smoothly lag behind aircraft movement
    this.smoothCenter.lat = lerp(this.smoothCenter.lat, targetCenter.lat, posLag);
    this.smoothCenter.lng = lerp(this.smoothCenter.lng, targetCenter.lng, posLag);
    this.smoothCenter.altitude = lerp(
      this.smoothCenter.altitude,
      targetCenter.altitude,
      posLag
    );

    // Smooth heading follow
    this.smoothHeading = lerpAngle(this.smoothHeading, targetHeading, headingLag);
    this.smoothTilt = lerp(this.smoothTilt, targetTilt, this.mode === 'COCKPIT' ? 1 : 0.15);
    this.smoothRange = lerp(this.smoothRange, targetRange, 0.15);

    // Apply directly to map
    this.map.center = {
      lat: this.smoothCenter.lat,
      lng: this.smoothCenter.lng,
      altitude: this.smoothCenter.altitude,
    };
    this.map.heading = this.smoothHeading;
    this.map.tilt = this.smoothTilt;
    this.map.range = this.smoothRange;
  }

  /**
   * Flies camera to an overview perspective showing the entire route.
   */
  public applyOverviewView(): void {
    if (!this.map || !this.activeRoute) return;

    const waypoints = this.activeRoute.waypoints;
    if (waypoints.length < 2) return;

    const midIndex = Math.floor(waypoints.length / 2);
    const midPoint = waypoints[midIndex];

    // Estimate suitable camera range based on route extent
    const start = waypoints[0];
    const end = waypoints[waypoints.length - 1];
    const latDiff = Math.abs(end.lat - start.lat);
    const lngDiff = Math.abs(end.lng - start.lng);
    const maxDiff = Math.max(latDiff, lngDiff);
    const range = Math.max(250000, maxDiff * 110000 * 1.5);

    if (this.map.flyCameraTo) {
      this.map.flyCameraTo({
        endCamera: {
          center: { lat: midPoint.lat, lng: midPoint.lng, altitude: 10000 },
          heading: this.headingOffset,
          tilt: this.tiltOverride ?? 35,
          range: range,
        },
        durationMillis: 2000,
      });
    } else {
      this.map.center = { lat: midPoint.lat, lng: midPoint.lng, altitude: 10000 };
      this.map.heading = this.headingOffset;
      this.map.tilt = this.tiltOverride ?? 35;
      this.map.range = range;
    }
  }

  /**
   * Resets camera to initial Haneda airport view.
   */
  public resetToHaneda(): void {
    if (!this.map) return;
    if (this.map.flyCameraTo) {
      this.map.flyCameraTo({
        endCamera: {
          center: { ...INITIAL_MAP_CONFIG.center },
          heading: INITIAL_MAP_CONFIG.heading,
          tilt: INITIAL_MAP_CONFIG.tilt,
          range: INITIAL_MAP_CONFIG.range,
        },
        durationMillis: 2000,
      });
    }
  }
}

