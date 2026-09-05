/**
 * Flight Information Telemetry HUD Component
 * Displays real-time altitude, groundspeed, heading, progress, and flight phase.
 */

import { TelemetryData, FlightRoute } from '../flight/types';

export class FlightInfo {
  private container: HTMLElement;
  private currentRoute: FlightRoute | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public setRoute(route: FlightRoute): void {
    this.currentRoute = route;
    this.renderInitial();
  }

  public updateTelemetry(telemetry: TelemetryData): void {
    const altEl = this.container.querySelector('#hud-altitude');
    const spdEl = this.container.querySelector('#hud-speed');
    const hdgEl = this.container.querySelector('#hud-heading');
    const prgEl = this.container.querySelector('#hud-progress');
    const distEl = this.container.querySelector('#hud-distance');
    const phaseEl = this.container.querySelector('#hud-phase');
    const pitchEl = this.container.querySelector('#hud-pitch');
    const rollEl = this.container.querySelector('#hud-roll');

    if (altEl) altEl.textContent = `${telemetry.altitude.toLocaleString()} m`;
    if (spdEl) spdEl.textContent = `${telemetry.speedKmh} km/h`;
    if (hdgEl) hdgEl.textContent = `${Math.round(telemetry.heading).toString().padStart(3, '0')}°`;
    if (prgEl) prgEl.textContent = `${Math.round(telemetry.progress * 100)}%`;
    if (distEl) distEl.textContent = `${telemetry.distanceRemainingKm} km`;
    if (phaseEl) {
      phaseEl.textContent = telemetry.flightPhase;
      phaseEl.className = `phase-pill phase-${telemetry.flightPhase.toLowerCase()}`;
    }
    if (pitchEl) {
      const p = telemetry.pitch;
      pitchEl.textContent = `${p >= 0 ? '+' : ''}${p.toFixed(1)}°`;
    }
    if (rollEl) {
      const r = telemetry.roll;
      rollEl.textContent = `${r >= 0 ? '+' : ''}${r.toFixed(1)}°`;
    }
  }

  private renderInitial(): void {
    if (!this.currentRoute) return;

    const { origin, destination, flightNumber, aircraftType } = this.currentRoute;

    this.container.innerHTML = `
      <div class="flight-info-hud">
        <div class="hud-top-bar">
          <div class="hud-route-badge">
            <span class="hud-route-text">${origin.code} → ${destination.code}</span>
            <span class="hud-flight-num">${flightNumber}</span>
          </div>
          <span id="hud-phase" class="phase-pill phase-takeoff">Takeoff</span>
        </div>

        <div class="hud-aircraft-model">${aircraftType}</div>

        <div class="hud-grid">
          <div class="hud-metric">
            <div class="metric-label">ALTITUDE (MSL)</div>
            <div class="metric-value luminous" id="hud-altitude">10 m</div>
          </div>
          <div class="hud-metric">
            <div class="metric-label">GROUND SPEED</div>
            <div class="metric-value" id="hud-speed">270 km/h</div>
          </div>
          <div class="hud-metric">
            <div class="metric-label">HEADING</div>
            <div class="metric-value" id="hud-heading">340°</div>
          </div>
          <div class="hud-metric">
            <div class="metric-label">PROGRESS</div>
            <div class="metric-value luminous" id="hud-progress">0%</div>
          </div>
          <div class="hud-metric">
            <div class="metric-label">DIST REMAINING</div>
            <div class="metric-value" id="hud-distance">-- km</div>
          </div>
          <div class="hud-metric">
            <div class="metric-label">ATTITUDE (P/R)</div>
            <div class="metric-subvalues">
              <span id="hud-pitch">+0.0°</span> / <span id="hud-roll">0.0°</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

