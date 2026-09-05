/**
 * Map & Camera Floating Control Toolbar
 * Controls Map Mode (HYBRID / SATELLITE), Camera Mode (FOLLOW / OVERVIEW / FREE),
 * and mobile drawer triggers.
 */

import { CameraMode } from '../map/CameraController';

export interface MapControlsHandlers {
  onMapModeChange: (mode: 'HYBRID' | 'SATELLITE') => void;
  onCameraModeChange: (mode: CameraMode) => void;
  onOpenMobileDepartures: () => void;
  onOffsetChange?: (offsetDeg: number) => void;
  onTiltChange?: (tiltDeg: number) => void;
}

export class MapControls {
  private container: HTMLElement;
  private handlers: MapControlsHandlers;
  private currentMapMode: 'HYBRID' | 'SATELLITE' = 'HYBRID';
  private currentCameraMode: CameraMode = 'CLOSE';

  constructor(container: HTMLElement, handlers: MapControlsHandlers) {
    this.container = container;
    this.handlers = handlers;
    this.render();
  }

  public setCameraMode(mode: CameraMode): void {
    this.currentCameraMode = mode;
    const buttons = this.container.querySelectorAll('.cam-mode-btn');
    buttons.forEach((btn) => {
      const btnMode = btn.getAttribute('data-mode');
      if (btnMode === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  public setMapMode(mode: 'HYBRID' | 'SATELLITE'): void {
    this.currentMapMode = mode;
    const hybridBtn = this.container.querySelector('#map-mode-hybrid');
    const satelliteBtn = this.container.querySelector('#map-mode-satellite');
    if (hybridBtn && satelliteBtn) {
      if (mode === 'HYBRID') {
        hybridBtn.classList.add('active');
        satelliteBtn.classList.remove('active');
      } else {
        hybridBtn.classList.remove('active');
        satelliteBtn.classList.add('active');
      }
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="map-controls-toolbar">
        <!-- Mobile Departures Button -->
        <button id="mobile-departures-btn" class="toolbar-btn mobile-only-btn" title="Open Departures">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
          <span>便一覧</span>
        </button>

        <!-- Camera Modes -->
        <div class="toolbar-group">
          <span class="group-label">CAMERA</span>
          <div class="segmented-control">
            <button class="cam-mode-btn ${this.currentCameraMode === 'CLOSE' ? 'active' : ''}" data-mode="CLOSE" title="機体のすぐ後ろ（近接追従）">
              CLOSE
            </button>
            <button class="cam-mode-btn ${this.currentCameraMode === 'FOLLOW' ? 'active' : ''}" data-mode="FOLLOW" title="後方斜め上（通常追従）">
              FOLLOW
            </button>
            <button class="cam-mode-btn ${this.currentCameraMode === 'COCKPIT' ? 'active' : ''}" data-mode="COCKPIT" title="パイロット視点（操縦席）">
              COCKPIT
            </button>
            <button class="cam-mode-btn ${this.currentCameraMode === 'OVERVIEW' ? 'active' : ''}" data-mode="OVERVIEW" title="全体俯瞰（機体拡大）">
              OVERVIEW
            </button>
            <button class="cam-mode-btn ${this.currentCameraMode === 'FREE' ? 'active' : ''}" data-mode="FREE" title="自由操作">
              FREE
            </button>
          </div>
        </div>

        <!-- Map Layer Mode -->
        <div class="toolbar-group">
          <span class="group-label">MAP</span>
          <div class="segmented-control">
            <button id="map-mode-hybrid" class="map-layer-btn ${this.currentMapMode === 'HYBRID' ? 'active' : ''}" data-mode="HYBRID">
              HYBRID
            </button>
            <button id="map-mode-satellite" class="map-layer-btn ${this.currentMapMode === 'SATELLITE' ? 'active' : ''}" data-mode="SATELLITE">
              SATELLITE
            </button>
          </div>
        </div>

        <!-- Camera Orientation -->
        <div class="toolbar-group">
          <span class="group-label" title="カメラの方位（追従方向からの角度）">HEADING</span>
          <div class="segmented-control">
            <button class="offset-btn active" data-offset="0">0°</button>
            <button class="offset-btn" data-offset="90">+90°</button>
            <button class="offset-btn" data-offset="-90">-90°</button>
            <button class="offset-btn" data-offset="180">180°</button>
          </div>
        </div>

        <div class="toolbar-group">
          <span class="group-label" title="カメラの傾き（0°が真上、90°が水平）">TILT</span>
          <div class="segmented-control">
            <button class="tilt-btn active" data-tilt="-1">AUTO</button>
            <button class="tilt-btn" data-tilt="0">0°</button>
            <button class="tilt-btn" data-tilt="45">45°</button>
            <button class="tilt-btn" data-tilt="90">90°</button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const camButtons = this.container.querySelectorAll('.cam-mode-btn');
    camButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode') as CameraMode;
        if (mode) {
          this.setCameraMode(mode);
          this.handlers.onCameraModeChange(mode);
        }
      });
    });

    const hybridBtn = this.container.querySelector('#map-mode-hybrid');
    const satelliteBtn = this.container.querySelector('#map-mode-satellite');

    if (hybridBtn) {
      hybridBtn.addEventListener('click', () => {
        this.setMapMode('HYBRID');
        this.handlers.onMapModeChange('HYBRID');
      });
    }

    if (satelliteBtn) {
      satelliteBtn.addEventListener('click', () => {
        this.setMapMode('SATELLITE');
        this.handlers.onMapModeChange('SATELLITE');
      });
    }

    const mobileBtn = this.container.querySelector('#mobile-departures-btn');
    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => {
        this.handlers.onOpenMobileDepartures();
      });
    }

    const offsetButtons = this.container.querySelectorAll('.offset-btn');
    offsetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const offset = Number(btn.getAttribute('data-offset'));
        offsetButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.handlers.onOffsetChange) {
          this.handlers.onOffsetChange(offset);
        }
      });
    });

    const tiltButtons = this.container.querySelectorAll('.tilt-btn');
    tiltButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tilt = Number(btn.getAttribute('data-tilt'));
        tiltButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.handlers.onTiltChange) {
          this.handlers.onTiltChange(tilt);
        }
      });
    });
  }
}
