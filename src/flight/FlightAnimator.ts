/**
 * Flight Animator
 * Drives smooth 3D interpolation along multi-waypoint flight trajectories,
 * calculating pitch, roll/bank, heading, and simulated ATC telemetry.
 */

import { FlightRoute, TelemetryData, Waypoint } from './types';
import {
  distanceBetween,
  bearingBetween,
  interpolateLatLng,
  interpolateAltitude,
  normalizeHeading,
  angleDifference,
} from '../utils/geo';
import { clamp, lerp, lerpAngle } from '../utils/interpolation';
import { DEFAULT_PLAYBACK_SPEED } from '../config';

export type TelemetryCallback = (telemetry: TelemetryData) => void;

interface RouteSegment {
  index: number;
  from: Waypoint;
  to: Waypoint;
  distanceMeters: number;
  startDistanceMeters: number;
  endDistanceMeters: number;
  bearing: number;
  altitudeDelta: number;
}

export class FlightAnimator {
  private route: FlightRoute | null = null;
  private segments: RouteSegment[] = [];
  private totalDistanceMeters = 0;

  // Playback state
  private isPlaying = false;
  private playbackDirection: 1 | -1 = 1; // 1 = Forward, -1 = Reverse
  private playbackSpeed: number = DEFAULT_PLAYBACK_SPEED; // Default to 1x as requested
  private progress = 0; // 0.0 to 1.0
  private lastRafTimestamp = 0;
  private rafId: number | null = null;

  // Smoothing state
  private currentHeading = 0;
  private currentPitch = 0;
  private currentRoll = 0;

  // Frame rate throttling (default ~30-40 fps to prevent GPU/DOM overload)
  private minFrameIntervalMs = 28; // ~35 fps cap
  private lastUpdateTimestamp = 0;

  // Telemetry listener
  private onTickCallback: TelemetryCallback | null = null;

  constructor(onTick?: TelemetryCallback) {
    if (onTick) {
      this.onTickCallback = onTick;
    }
  }

  public setRoute(route: FlightRoute): void {
    this.pause();
    this.route = route;
    this.progress = 0;
    this.playbackDirection = 1;
    this.isPlaying = false;
    this.buildSegments();

    if (this.segments.length > 0) {
      this.currentHeading = this.segments[0].bearing;
      this.currentPitch = 0;
      this.currentRoll = 0;
    }

    this.emitCurrentTelemetry();
  }

  private buildSegments(): void {
    if (!this.route || this.route.waypoints.length < 2) {
      this.segments = [];
      this.totalDistanceMeters = 0;
      return;
    }

    this.segments = [];
    let accumulatedDistance = 0;

    for (let i = 0; i < this.route.waypoints.length - 1; i++) {
      const from = this.route.waypoints[i];
      const to = this.route.waypoints[i + 1];
      const dist = Math.max(10, distanceBetween(from, to));
      const bearing = bearingBetween(from, to);
      const altDelta = to.altitude - from.altitude;

      this.segments.push({
        index: i,
        from,
        to,
        distanceMeters: dist,
        startDistanceMeters: accumulatedDistance,
        endDistanceMeters: accumulatedDistance + dist,
        bearing,
        altitudeDelta: altDelta,
      });

      accumulatedDistance += dist;
    }

    this.totalDistanceMeters = accumulatedDistance;
  }

  public play(): void {
    this.playForward();
  }

  public playForward(): void {
    this.playbackDirection = 1;
    if (this.progress >= 1.0) {
      this.progress = 0;
    }
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.lastRafTimestamp = performance.now();
      this.rafId = requestAnimationFrame(this.onAnimationFrame);
    }
  }

  public playReverse(): void {
    this.playbackDirection = -1;
    if (this.progress <= 0.0) {
      this.progress = 1.0;
    }
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.lastRafTimestamp = performance.now();
      this.rafId = requestAnimationFrame(this.onAnimationFrame);
    }
  }

  public toggleReverse(): boolean {
    if (this.isPlaying && this.playbackDirection === -1) {
      this.pause();
      return false;
    } else {
      this.playReverse();
      return true;
    }
  }

  public pause(): void {
    this.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public togglePlay(): boolean {
    if (this.isPlaying && this.playbackDirection === 1) {
      this.pause();
    } else {
      this.playForward();
    }
    return this.isPlaying && this.playbackDirection === 1;
  }

  public restart(): void {
    this.progress = 0;
    this.playbackDirection = 1;
    this.emitCurrentTelemetry();
    this.playForward();
  }

  public seek(targetProgress: number): void {
    this.progress = clamp(targetProgress, 0, 1);
    this.emitCurrentTelemetry();
  }

  public setSpeed(speed: number): void {
    this.playbackSpeed = clamp(speed, 1, 60);
  }

  public getSpeed(): number {
    return this.playbackSpeed;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getDirection(): 1 | -1 {
    return this.playbackDirection;
  }

  public getProgress(): number {
    return this.progress;
  }

  public onTick(cb: TelemetryCallback): void {
    this.onTickCallback = cb;
  }

  /**
   * Pacing Factor for Takeoff & Landing:
   * Starts with a slower simulation rate during departure and landing phases,
   * making the liftoff and touchdown cinematic and clearly visible.
   */
  private getPacingFactor(progress: number): number {
    // Departure & initial climb phase (0% - 8%)
    if (progress < 0.08) {
      const ratio = progress / 0.08;
      return lerp(0.28, 1.0, ratio * ratio * (3 - 2 * ratio)); // Quad ease-in
    }
    // Final approach & landing phase (92% - 100%)
    if (progress > 0.92) {
      const ratio = (1.0 - progress) / 0.08;
      return lerp(0.28, 1.0, ratio * ratio * (3 - 2 * ratio)); // Quad ease-out
    }
    return 1.0;
  }

  private onAnimationFrame = (timestamp: number): void => {
    if (!this.isPlaying) return;

    const deltaSec = clamp((timestamp - this.lastRafTimestamp) / 1000, 0, 0.1);
    this.lastRafTimestamp = timestamp;

    if (this.route && this.totalDistanceMeters > 0) {
      const nominalDuration = this.route.durationSeconds || 180;
      const pacing = this.getPacingFactor(this.progress);
      const progressIncrement =
        (deltaSec * this.playbackSpeed * pacing * this.playbackDirection) / nominalDuration;

      this.progress += progressIncrement;

      // Handle forward boundary
      if (this.playbackDirection === 1 && this.progress >= 1.0) {
        this.progress = 1.0;
        this.pause();
      }

      // Handle reverse boundary
      if (this.playbackDirection === -1 && this.progress <= 0.0) {
        this.progress = 0.0;
        this.pause();
      }

      // Throttle map updates if desired
      if (!this.isPlaying || timestamp - this.lastUpdateTimestamp >= this.minFrameIntervalMs) {
        this.lastUpdateTimestamp = timestamp;
        this.emitCurrentTelemetry();
      }
    }

    if (this.isPlaying) {
      this.rafId = requestAnimationFrame(this.onAnimationFrame);
    }
  };

  /**
   * Calculates telemetry at current progress.
   */
  public calculateTelemetryAt(progress: number): TelemetryData {
    if (!this.route || this.segments.length === 0) {
      return this.createFallbackTelemetry();
    }

    const currentDist = progress * this.totalDistanceMeters;

    // Locate current segment
    let segment = this.segments[this.segments.length - 1];
    for (let i = 0; i < this.segments.length; i++) {
      if (currentDist <= this.segments[i].endDistanceMeters || i === this.segments.length - 1) {
        segment = this.segments[i];
        break;
      }
    }

    // Segment progress t in [0, 1]
    const segmentLength = segment.distanceMeters;
    const distInSegment = currentDist - segment.startDistanceMeters;
    const t = clamp(distInSegment / segmentLength, 0, 1);

    // Interpolated position and altitude
    const latLng = interpolateLatLng(segment.from, segment.to, t);
    const altitude = interpolateAltitude(segment.from.altitude, segment.to.altitude, t);

    // Target Heading
    // Blend heading smoothly toward upcoming segment if nearing segment end
    let targetHeading = segment.bearing;
    if (t > 0.7 && segment.index < this.segments.length - 1) {
      const nextSegment = this.segments[segment.index + 1];
      const blendFactor = (t - 0.7) / 0.3;
      targetHeading = lerpAngle(segment.bearing, nextSegment.bearing, blendFactor);
    }

    // Target Pitch (Climb/Descent rate)
    // Vertical speed ratio: deltaAlt / deltaDist
    const grade = segment.altitudeDelta / segment.distanceMeters;
    let targetPitch = 0;
    if (grade > 0.005) {
      // Climb: pitch up between +6° and +11°
      targetPitch = clamp(grade * 150, 4, 11);
    } else if (grade < -0.005) {
      // Descent: pitch down between -3° and -7°
      targetPitch = clamp(grade * 120, -7, -2);
    }

    // Target Roll (Banking into turns)
    // Compare current bearing with next or previous
    let targetRoll = 0;
    if (segment.index < this.segments.length - 1) {
      const nextBearing = this.segments[segment.index + 1].bearing;
      const turnDelta = angleDifference(nextBearing, segment.bearing);
      if (Math.abs(turnDelta) > 5) {
        // If approaching turn (t > 0.6) or inside turn
        const turnLead = t > 0.6 ? (t - 0.6) / 0.4 : 0;
        // Right turn: positive roll, left turn: negative roll
        targetRoll = clamp(turnDelta * 0.4 * turnLead, -18, 18);
      }
    }

    // Smooth physics transitions (lerp)
    this.currentHeading = lerpAngle(this.currentHeading, targetHeading, 0.15);
    this.currentPitch = lerp(this.currentPitch, targetPitch, 0.1);
    this.currentRoll = lerp(this.currentRoll, targetRoll, 0.1);

    // Simulated groundspeed based on altitude & phase
    let speedKmh = 860;
    if (altitude < 300) {
      speedKmh = 270;
    } else if (altitude < 3000) {
      speedKmh = lerp(350, 600, (altitude - 300) / 2700);
    } else if (altitude < 8000) {
      speedKmh = lerp(600, 840, (altitude - 3000) / 5000);
    } else {
      speedKmh = 860 + Math.sin(progress * 10) * 15;
    }

    const distanceRemainingKm = Math.max(0, (this.totalDistanceMeters - currentDist) / 1000);
    const totalDistanceKm = this.totalDistanceMeters / 1000;

    // Flight phase determination
    let flightPhase: TelemetryData['flightPhase'] = 'Cruise';
    if (progress <= 0.03 && altitude < 100) {
      flightPhase = 'Takeoff';
    } else if (grade > 0.005 && altitude < 8000) {
      flightPhase = 'Climb';
    } else if (progress >= 0.97 && altitude < 100) {
      flightPhase = 'Landed';
    } else if (grade < -0.005 && altitude < 2500) {
      flightPhase = 'Approach';
    } else if (grade < -0.005) {
      flightPhase = 'Descent';
    }

    return {
      lat: latLng.lat,
      lng: latLng.lng,
      altitude: Math.round(altitude),
      speedKmh: Math.round(speedKmh),
      heading: normalizeHeading(this.currentHeading),
      pitch: Number(this.currentPitch.toFixed(1)),
      roll: Number(this.currentRoll.toFixed(1)),
      progress: clamp(progress, 0, 1),
      distanceRemainingKm: Number(distanceRemainingKm.toFixed(1)),
      totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
      isClimbing: grade > 0.005,
      isDescent: grade < -0.005,
      flightPhase,
    };
  }

  private emitCurrentTelemetry(): void {
    if (this.onTickCallback) {
      const telemetry = this.calculateTelemetryAt(this.progress);
      this.onTickCallback(telemetry);
    }
  }

  private createFallbackTelemetry(): TelemetryData {
    return {
      lat: 35.5494,
      lng: 139.7798,
      altitude: 10,
      speedKmh: 0,
      heading: 340,
      pitch: 0,
      roll: 0,
      progress: 0,
      distanceRemainingKm: 0,
      totalDistanceKm: 0,
      isClimbing: false,
      isDescent: false,
      flightPhase: 'Takeoff',
    };
  }

  public destroy(): void {
    this.pause();
    this.onTickCallback = null;
  }
}

