/**
 * Flight Panel Component
 * Displays Haneda departures board, route selection list, and mobile drawer toggling.
 */

import { FlightDeparture } from '../flight/types';

export class FlightPanel {
  private container: HTMLElement;
  private departures: FlightDeparture[] = [];
  private selectedRouteId: string = '';
  private onSelectCallback: ((routeId: string) => void) | null = null;
  private isOpenOnMobile = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public setDepartures(departures: FlightDeparture[], selectedId: string): void {
    this.departures = departures;
    this.selectedRouteId = selectedId;
    this.render();
  }

  public setSelectedRoute(routeId: string): void {
    this.selectedRouteId = routeId;
    this.updateSelectionState();
  }

  public onSelect(cb: (routeId: string) => void): void {
    this.onSelectCallback = cb;
  }

  public toggleMobileDrawer(): void {
    this.isOpenOnMobile = !this.isOpenOnMobile;
    const panelEl = this.container.querySelector('.flight-panel');
    if (panelEl) {
      panelEl.classList.toggle('open-mobile', this.isOpenOnMobile);
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="flight-panel ${this.isOpenOnMobile ? 'open-mobile' : ''}">
        <div class="panel-header">
          <div class="brand-row">
            <div class="brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"/>
              </svg>
            </div>
            <div>
              <h1 class="brand-title">SkyRoute</h1>
              <div class="brand-subtitle">Google Photorealistic 3D Flight Tracker</div>
            </div>
          </div>
          <button class="mobile-close-btn" id="mobile-close-btn" aria-label="Close Departures">
            ✕
          </button>
        </div>

        <div class="departures-section">
          <div class="section-title-row">
            <div class="pulse-dot"></div>
            <span class="section-title">HND DEPARTURES</span>
            <span class="airport-code-tag">RJTT / 羽田</span>
          </div>

          <div class="routes-list" id="routes-list">
            ${this.departures
              .map(
                (dep) => `
              <div class="route-card ${dep.id === this.selectedRouteId ? 'active' : ''}" data-route-id="${dep.id}">
                <div class="route-header-row">
                  <span class="flight-number">${dep.flightNumber}</span>
                  <span class="route-status">${dep.status}</span>
                </div>
                <div class="route-destination-row">
                  <div class="airport-pair">
                    <span class="origin-code">HND</span>
                    <span class="flight-arrow">✈</span>
                    <span class="dest-code">${dep.destinationCode}</span>
                  </div>
                  <div class="destination-name">${dep.destinationName}</div>
                </div>
                <div class="route-meta-row">
                  <span class="meta-item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    ${dep.scheduledTime}
                  </span>
                  <span class="meta-item">Gate ${dep.gate}</span>
                  <span class="meta-aircraft">B787-10</span>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="demo-route-notice">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>Demo Route (概算飛行ルート・シミュレーション)</span>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private updateSelectionState(): void {
    const cards = this.container.querySelectorAll('.route-card');
    cards.forEach((card) => {
      const id = card.getAttribute('data-route-id');
      if (id === this.selectedRouteId) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  private attachEventListeners(): void {
    const cards = this.container.querySelectorAll('.route-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-route-id');
        if (id && id !== this.selectedRouteId) {
          this.setSelectedRoute(id);
          if (this.onSelectCallback) {
            this.onSelectCallback(id);
          }
          // On mobile, close drawer after selection
          if (window.innerWidth < 768) {
            this.isOpenOnMobile = false;
            this.container.querySelector('.flight-panel')?.classList.remove('open-mobile');
          }
        }
      });
    });

    const closeBtn = this.container.querySelector('#mobile-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.toggleMobileDrawer();
      });
    }
  }
}

