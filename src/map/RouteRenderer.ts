/**
 * 3D Flight Route Renderer
 * Renders high-altitude 3D flight trajectory polylines using Polyline3DElement with ABSOLUTE altitude.
 */

import { Maps3DLibrary } from './initMap3D';
import { Waypoint } from '../flight/types';

export class RouteRenderer {
  private polylineElement: any = null;
  private mapElement: HTMLElement | null = null;

  constructor(
    private lib: Maps3DLibrary,
    map: HTMLElement
  ) {
    this.mapElement = map;
  }

  /**
   * Sets and renders waypoints as a floating 3D polyline.
   */
  public setRoute(waypoints: Waypoint[], type: 'FILED' | 'ACTUAL' | 'ESTIMATED' = 'ACTUAL'): void {
    if (waypoints.length < 2) { this.clear(); return; }
    const color = type === 'ACTUAL' ? '#00D4FF' : type === 'FILED' ? '#3578FF' : '#3578FF66';
    const { Polyline3DElement, AltitudeMode } = this.lib;

    // Format coordinates with explicit altitude for 3D aerial path
    const coordinates = waypoints.map((wp) => ({
      lat: wp.lat,
      lng: wp.lng,
      altitude: wp.altitude,
    }));

    if (!this.polylineElement) {
      this.polylineElement = new Polyline3DElement({
        coordinates,
        altitudeMode: AltitudeMode.ABSOLUTE,
        strokeColor: color, // High-visibility luminous cyan
        strokeWidth: 8,
        outerColor: '#0044BB', // Darker blue glow contrast
        outerWidth: 0.3,
        drawsOccludedSegments: true,
      });

      if (this.mapElement) {
        this.mapElement.appendChild(this.polylineElement);
      }
    } else {
      this.polylineElement.coordinates = coordinates;
      this.polylineElement.strokeColor = color;
    }
  }

  public clear(): void {
    if (this.polylineElement && this.mapElement) {
      this.mapElement.removeChild(this.polylineElement);
      this.polylineElement = null;
    }
  }

  public destroy(): void {
    this.clear();
  }
}

