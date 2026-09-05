/**
 * Loading Overlay Component
 * Provides an aviation-themed HUD loading screen with status messages.
 */

export class LoadingOverlay {
  private element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'loading-overlay';
    this.element.innerHTML = `
      <div class="loading-content">
        <div class="radar-spinner">
          <div class="radar-circle circle-1"></div>
          <div class="radar-circle circle-2"></div>
          <div class="radar-sweep"></div>
          <div class="radar-center-blip"></div>
        </div>
        <div class="loading-brand">SkyRoute</div>
        <div class="loading-title" id="loading-status-text">Loading Photorealistic 3D Map...</div>
        <div class="loading-subtitle">Boeing 787-10 Dreamliner & Haneda Airport</div>
      </div>
    `;
    document.body.appendChild(this.element);
  }

  public updateStatus(statusText: string): void {
    const textEl = this.element.querySelector('#loading-status-text');
    if (textEl) {
      textEl.textContent = statusText;
    }
  }

  public hide(): void {
    this.element.classList.add('fade-out');
    setTimeout(() => {
      if (this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
    }, 600);
  }
}

