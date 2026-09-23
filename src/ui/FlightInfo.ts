import type { TelemetryData, FlightRoute } from '../flight/types';
import { escapeHtml } from './LiveFlightView';

/** Simulated departures use the same flight information layout as LIVE. */
export class FlightInfo {
  private currentRoute: FlightRoute | null = null;
  constructor(private container: HTMLElement) {}

  setRoute(route: FlightRoute): void {
    this.currentRoute = route;
    const flight = escapeHtml(route.flightNumber);
    const origin = escapeHtml(route.origin.code);
    const destination = escapeHtml(route.destination.code);
    const aircraft = escapeHtml(route.aircraftType);
    this.container.innerHTML = `<div class="flight-info-hud live-info">
      <div class="hud-top-bar"><span class="hud-route-text">${flight} · ${origin} → ${destination}</span><span class="phase-pill">DEMO</span></div>
      <div class="live-airports">${escapeHtml(route.origin.name)} → ${escapeHtml(route.destination.name)}</div>
      <div class="live-metadata">Operated by ${escapeHtml(route.airline)} · Simulated flight<br>Aircraft: ${aircraft}</div>
      <div class="hud-grid"><div><div class="metric-label">ALTITUDE</div><div class="metric-value luminous" id="hud-altitude">--</div></div>
      <div><div class="metric-label">GROUND SPEED</div><div class="metric-value" id="hud-speed">--</div></div>
      <div><div class="metric-label">HEADING</div><div class="metric-value" id="hud-heading">--</div></div>
      <div><div class="metric-label">ROUTE</div><div id="demo-route-type">DEMO</div></div></div>
      <div class="live-ai-commentary"><div class="live-ai-text">【デモ用の仮の解説】${origin}発${destination}行きの飛行を再現しています。表示される高度・速度・航路はシミュレーションであり、実際の運航状況や気象を反映したものではありません。</div></div>
      <div class="live-ai-model-note">AI解説サンプル · AIによる取得・生成結果ではありません</div>
      <div class="live-message" role="status">DEMO · Simulated flight</div>
    </div>`;
  }

  updateTelemetry(telemetry: TelemetryData): void {
    if (!this.currentRoute) return;
    const set = (id: string, text: string) => { const node = this.container.querySelector('#' + id); if (node) node.textContent = text; };
    set('hud-altitude', `${Math.round(telemetry.altitude).toLocaleString()} m (est.)`);
    set('hud-speed', `${Math.round(telemetry.speedKmh)} km/h`);
    set('hud-heading', `${Math.round(telemetry.heading)}°`);
  }
}
