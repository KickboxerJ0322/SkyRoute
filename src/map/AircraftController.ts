/**
 * Aircraft 3D Model Controller
 * Manages Model3DElement lifecycle, position, scale, and 3-axis orientation (heading, pitch, roll).
 */

import { Maps3DLibrary } from './initMap3D';
import {
  AIRCRAFT_MODEL_URL,
  AIRCRAFT_SCALE_NORMAL,
  MODEL_HEADING_OFFSET_DEG,
  MODEL_TILT_OFFSET_DEG,
  MODEL_ROLL_OFFSET_DEG,
} from '../config';
import { TelemetryData } from '../flight/types';
import { normalizeHeading } from '../utils/geo';

export class AircraftController {
  private modelElement: any = null;
  private mapElement: HTMLElement | null = null;
  private userHeadingDelta: number = 0;
  private userTiltDelta: number = 0;
  private userRollDelta: number = 0;

  constructor(
    private lib: Maps3DLibrary,
    map: HTMLElement
  ) {
    this.mapElement = map;
    this.createModel();
  }

  private createModel(): void {
    const { Model3DElement, AltitudeMode } = this.lib;

    this.modelElement = new Model3DElement({
      src: AIRCRAFT_MODEL_URL,
      position: { lat: 35.5494, lng: 139.7798, altitude: 1000 },
      orientation: {
        heading: normalizeHeading(MODEL_HEADING_OFFSET_DEG),
        tilt: MODEL_TILT_OFFSET_DEG,
        roll: MODEL_ROLL_OFFSET_DEG,
      },
      scale: AIRCRAFT_SCALE_NORMAL,
      altitudeMode: AltitudeMode.ABSOLUTE,
    });

    if (this.mapElement) {
      this.mapElement.appendChild(this.modelElement);
    }
  }

  /**
   * Updates aircraft 3D position and orientation according to telemetry.
   */
  public update(telemetry: TelemetryData): void {
    if (!this.modelElement) return;

    // Apply geographic position and absolute altitude
    this.modelElement.position = {
      lat: telemetry.lat,
      lng: telemetry.lng,
      altitude: telemetry.altitude,
    };

    // Baseline: Heading -90°, Tilt 270° keeps 787-10 model upright and pointing forward
    const adjustedHeading = normalizeHeading(
      telemetry.heading + MODEL_HEADING_OFFSET_DEG + this.userHeadingDelta
    );
    const adjustedTilt = telemetry.pitch + MODEL_TILT_OFFSET_DEG + this.userTiltDelta;
    const adjustedRoll = telemetry.roll + MODEL_ROLL_OFFSET_DEG + this.userRollDelta;

    // Orientation applies roll, tilt, heading in maps3d
    this.modelElement.orientation = {
      heading: adjustedHeading,
      tilt: adjustedTilt,
      roll: adjustedRoll,
    };
  }

  /**
   * Adjusts heading delta dynamically (0° = standard baseline).
   */
  public setHeadingDelta(deltaDeg: number): void {
    this.userHeadingDelta = deltaDeg;
  }

  public getHeadingDelta(): number {
    return this.userHeadingDelta;
  }

  /**
   * Adjusts tilt delta dynamically (0° = standard baseline).
   */
  public setTiltDelta(deltaDeg: number): void {
    this.userTiltDelta = deltaDeg;
  }

  public getTiltDelta(): number {
    return this.userTiltDelta;
  }

  /**
   * Adjusts roll delta dynamically.
   */
  public setRollDelta(deltaDeg: number): void {
    this.userRollDelta = deltaDeg;
  }

  public getRollOffset(): number {
    return this.userRollDelta;
  }

  /**
   * Adjusts scale dynamically.
   */
  public setScale(scale: number): void {
    if (this.modelElement) {
      this.modelElement.scale = scale;
    }
  }

  public setPosition(lat: number, lng: number, altitude: number): void {
    if (this.modelElement) {
      this.modelElement.position = { lat, lng, altitude };
    }
  }

  public destroy(): void {
    if (this.modelElement && this.mapElement) {
      this.mapElement.removeChild(this.modelElement);
      this.modelElement = null;
    }
  }
}

