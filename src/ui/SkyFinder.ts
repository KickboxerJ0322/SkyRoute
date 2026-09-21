import type { AircraftController } from '../map/AircraftController';
import type { SkyRouteFlight, SkyRoutePosition } from '../flight/liveTypes';

export type NearbyFlight = SkyRouteFlight & { position: SkyRoutePosition };
type UserLocation = { lat: number; lng: number };

export class SkyFinder {
  private visible = false;
  private location: UserLocation | null = null;
  private locationLabel = '現在地';
  private flights: (NearbyFlight & { __distance?: number; __bearing?: number })[] = [];

  constructor(
    private container: HTMLElement,
    private map: any,
    private aircraft: AircraftController,
    private onFlightInfo?: (flight: NearbyFlight) => void
  ) {
    this.renderIntro();
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.container.hidden = !visible;
    if (!visible) this.aircraft.setVisible(false);
  }

  private renderIntro(message = '現在地、住所、地名から周辺を飛んでいる旅客機を探せます。'): void {
    this.container.innerHTML = `
      <section class="sky-finder-panel">
        <div class="sky-finder-header">
          <div>
            <div class="sky-finder-kicker">SKY FINDER</div>
            <h2>あの飛行機、どこ行き？</h2>
          </div>
          <span class="sky-finder-live">LIVE</span>
        </div>
        <p class="sky-finder-copy">${escapeHtml(message)}</p>
        <button id="sky-finder-locate" class="sky-finder-primary" type="button">現在地から探す</button>
        <div class="sky-finder-place-search">
          <input id="sky-finder-place" type="search" placeholder="住所・地名（例：東京駅、横浜市）" aria-label="検索する住所または地名" />
          <button id="sky-finder-place-btn" type="button">場所を指定</button>
        </div>
        <p class="sky-finder-note">位置情報や入力した場所は周辺航空機の検索にのみ使用し、SkyRouteでは保存しません。</p>
        <div id="sky-finder-results"></div>
      </section>
    `;
    this.container.querySelector('#sky-finder-locate')?.addEventListener('click', () => void this.searchCurrentLocation());
    this.container.querySelector('#sky-finder-place-btn')?.addEventListener('click', () => void this.searchPlace());
    this.container.querySelector<HTMLInputElement>('#sky-finder-place')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.searchPlace();
      }
    });
  }

  private async searchCurrentLocation(): Promise<void> {
    const button = this.container.querySelector<HTMLButtonElement>('#sky-finder-locate');
    if (button) {
      button.disabled = true;
      button.textContent = '現在地を取得中...';
    }
    try {
      this.location = await locate();
      this.locationLabel = '現在地';
      if (button) button.textContent = '航空機を検索中...';
      await this.loadNearby();
    } catch (error) {
      const permissionDenied =
        typeof error === 'object' && error !== null && 'code' in error &&
        Number((error as { code?: number }).code) === 1;
      this.renderIntro(permissionDenied
        ? '位置情報の利用が許可されていません。住所・地名検索も利用できます。'
        : '現在地から航空機を取得できませんでした。住所・地名検索もお試しください。');
    } finally {
      const current = this.container.querySelector<HTMLButtonElement>('#sky-finder-locate');
      if (current) {
        current.disabled = false;
        current.textContent = '現在地から再検索';
      }
    }
  }

  private async searchPlace(): Promise<void> {
    const input = this.container.querySelector<HTMLInputElement>('#sky-finder-place');
    const button = this.container.querySelector<HTMLButtonElement>('#sky-finder-place-btn');
    const query = input?.value.trim() || '';
    if (!query) return;
    if (button) {
      button.disabled = true;
      button.textContent = '検索中...';
    }
    try {
      const maps = (globalThis as any).google?.maps;
      if (!maps?.Geocoder) throw new Error('GEOCODER_UNAVAILABLE');
      const geocoder = new maps.Geocoder();
      const result:any = await new Promise((resolve,reject) => {
        geocoder.geocode({ address: query, region: 'JP' }, (results:any[], status:string) => {
          if (status === 'OK' && results?.length) resolve(results[0]);
          else reject(new Error(status || 'GEOCODE_FAILED'));
        });
      });
      const point = result.geometry?.location;
      this.location = {
        lat: typeof point?.lat === 'function' ? point.lat() : Number(point?.lat),
        lng: typeof point?.lng === 'function' ? point.lng() : Number(point?.lng),
      };
      if (!Number.isFinite(this.location.lat) || !Number.isFinite(this.location.lng)) throw new Error('INVALID_GEOCODE');
      this.locationLabel = result.formatted_address || query;
      await this.loadNearby();
    } catch {
      const root = this.container.querySelector('#sky-finder-results');
      if (root) root.innerHTML = '<div class="sky-finder-empty">場所を特定できませんでした。別の住所・地名を入力してください。</div>';
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = '場所を指定';
      }
    }
  }

  private async loadNearby(): Promise<void> {
    if (!this.location) return;
    const response = await fetch(
      `/api/flights/nearby?lat=${encodeURIComponent(this.location.lat)}&lng=${encodeURIComponent(this.location.lng)}&radius=80`
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'SEARCH_FAILED');
    this.flights = (body.data || [])
      .map((flight: NearbyFlight) => ({
        ...flight,
        __distance: distanceKm(this.location!, flight.position),
        __bearing: bearing(this.location!, flight.position),
      }))
      .sort((a: any, b: any) => a.__distance - b.__distance)
      .slice(0, 15);
    this.renderResults(body.stale === true);
  }

  private renderResults(stale: boolean): void {
    const root = this.container.querySelector('#sky-finder-results');
    if (!root || !this.location) return;
    if (!this.flights.length) {
      root.innerHTML = `<div class="sky-finder-summary"><span>${escapeHtml(this.locationLabel)}</span></div><div class="sky-finder-empty">半径80km以内で表示できる旅客機が見つかりませんでした。</div>`;
      return;
    }

    root.innerHTML = `
      <div class="sky-finder-summary">
        <span title="${escapeHtml(this.locationLabel)}">${escapeHtml(shortLabel(this.locationLabel))} · 半径80km</span>
        <strong>${this.flights.length}機</strong>${stale ? '<em>CACHED</em>' : ''}
      </div>
      <div class="sky-finder-list">
        ${this.flights.map((flight: any) => `
          <div class="sky-finder-card" data-flight-id="${escapeHtml(flight.id)}">
            <div class="sky-finder-card-top">
              <strong>${escapeHtml(flight.ident || flight.callsign || '--')}</strong>
              <span>${formatDistance(flight.__distance)}</span>
            </div>
            <div class="sky-finder-route">${escapeHtml(code(flight.origin))} → ${escapeHtml(code(flight.destination))}</div>
            <div class="sky-finder-meta">
              <span>${formatAltitude(flight.position.altitudeMeters)}</span>
              <span>${formatSpeed(flight.position.groundSpeedKmh)}</span>
              <span>${compass(flight.__bearing)} ${Math.round(flight.__bearing)}°</span>
            </div>
            <div class="sky-finder-card-actions">
              <button type="button" class="sky-finder-focus">3D表示</button>
              <button type="button" class="sky-finder-info">飛行情報</button>
            </div>
          </div>
        `).join('')}
      </div>
      <div id="sky-finder-detail" class="sky-finder-detail">「3D表示」で機体へ移動し、「飛行情報」で詳細を表示します。</div>
    `;

    root.querySelectorAll<HTMLElement>('.sky-finder-card').forEach(card => {
      const flight = this.flights.find(item => item.id === card.dataset.flightId);
      if (!flight) return;
      card.querySelector('.sky-finder-focus')?.addEventListener('click', () => this.focus(flight, card));
      card.querySelector('.sky-finder-info')?.addEventListener('click', () => this.onFlightInfo?.(flight));
    });
  }

  private focus(flight: NearbyFlight, card: HTMLElement): void {
    if (!this.visible) return;
    this.container.querySelectorAll('.sky-finder-card').forEach(item => item.classList.remove('active'));
    card.classList.add('active');
    const position = flight.position;
    const altitude = position.altitudeMeters ?? 1000;
    const heading = position.heading ?? 0;

    this.aircraft.setVisible(true);
    this.aircraft.update({
      lat: position.latitude, lng: position.longitude, altitude,
      speedKmh: position.groundSpeedKmh ?? 0, heading,
      pitch: 0, roll: 0, progress: 0, distanceRemainingKm: 0,
      totalDistanceKm: 0, isClimbing: false, isDescent: false, flightPhase: 'Cruise',
    });

    const camera = {
      center: { lat: position.latitude, lng: position.longitude, altitude: altitude + 100 },
      heading, tilt: 70, range: 1800,
    };
    if (this.map?.flyCameraTo) this.map.flyCameraTo({ endCamera: camera, durationMillis: 1600 });
    else {
      this.map.center = camera.center; this.map.heading = camera.heading;
      this.map.tilt = camera.tilt; this.map.range = camera.range;
    }

    const detail = this.container.querySelector('#sky-finder-detail');
    if (detail) detail.innerHTML = `
      <strong>${escapeHtml(flight.ident)}</strong>
      <span>${escapeHtml(code(flight.origin))} → ${escapeHtml(code(flight.destination))}</span>
      <span>${escapeHtml(flight.destination.name || '')}</span>
      <span>${formatAltitude(position.altitudeMeters)} / ${formatSpeed(position.groundSpeedKmh)}</span>
    `;
  }
}

function locate(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GEOLOCATION_UNAVAILABLE'));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

function distanceKm(a: UserLocation, b: SkyRoutePosition): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.lat) * rad;
  const dLng = (b.longitude - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
function bearing(a: UserLocation, b: SkyRoutePosition): number {
  const rad = Math.PI / 180;
  const lat1 = a.lat * rad, lat2 = b.latitude * rad, dLng = (b.longitude - a.lng) * rad;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
function compass(degrees: number): string {
  const labels = ['北','北東','東','南東','南','南西','西','北西'];
  return labels[Math.round(degrees / 45) % 8];
}
function code(airport: NearbyFlight['origin']): string { return airport.iata || airport.icao || '--'; }
function formatDistance(value: number): string { return value < 10 ? `${value.toFixed(1)} km` : `${Math.round(value)} km`; }
function formatAltitude(value: number | null): string { return value === null ? '高度 --' : `高度 ${Math.round(value).toLocaleString()} m`; }
function formatSpeed(value: number | null): string { return value === null ? '速度 --' : `${Math.round(value)} km/h`; }
function shortLabel(value:string):string { return value.length > 22 ? value.slice(0,21)+'…' : value; }
function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
