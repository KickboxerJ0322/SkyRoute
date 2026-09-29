/**
 * Map & Camera Floating Control Toolbar
 * Controls Map Mode (HYBRID / SATELLITE), Camera Mode (FOLLOW / OVERVIEW / FREE),
 * and mobile drawer triggers.
 */

import { CameraMode } from '../map/CameraController';
import { AIRCRAFT_MODEL_URL } from '../config';
import { AIRCRAFT_MODELS } from '../flight/aircraftModel';

export interface MapControlsHandlers {
  onMapModeChange: (mode: 'HYBRID' | 'SATELLITE') => void;
  onCameraModeChange: (mode: CameraMode) => void;
  onAircraftModelChange: (modelUrl: string) => void;
  onOpenMobileDepartures: () => void;
  onOffsetChange?: (offsetDeg: number) => void;
  onTiltChange?: (tiltDeg: number) => void;
  onRotateView?: (degrees: number) => void;
  onSigmetToggle?: (enabled: boolean) => void;
  onNowcastToggle?: (enabled: boolean) => void;
  onNowcast3DTimeChange?: (mode: 'current' | 'forecast60') => void;
  onNowcast3DLayerToggle?: (layer: 'rain' | 'thunder' | 'tornado', enabled: boolean) => void;
}

export class MapControls {
  private container: HTMLElement;
  private handlers: MapControlsHandlers;
  private currentMapMode: 'HYBRID' | 'SATELLITE' = 'HYBRID';
  private currentCameraMode: CameraMode = 'CLOSE';
  private currentAircraftModelUrl = AIRCRAFT_MODEL_URL;
  private sigmetEnabled = true;
  private nowcastEnabled = true;
  private nowcast3DLayers: Record<'rain'|'thunder'|'tornado',boolean> = {
    rain:true,
    thunder:true,
    tornado:true,
  };

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

  public setAircraftModel(modelUrl: string): void {
    this.currentAircraftModelUrl = modelUrl || AIRCRAFT_MODEL_URL;
    const select = this.container.querySelector<HTMLSelectElement>('#aircraft-model-select');
    if (select) select.value = this.currentAircraftModelUrl;
  }

  public setSigmetState(enabled: boolean, status?: string, count?: number): void {
    this.sigmetEnabled = enabled;
    const button = this.container.querySelector<HTMLButtonElement>('#sigmet-toggle');
    if (!button) return;
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled
      ? (count === undefined ? 'SIGMET ON' : `SIGMET ON · ${count}件`)
      : 'SIGMET OFF';
    button.title = status || (enabled ? 'SIGMET表示をOFFにする' : '航路周辺のSIGMETを表示');
  }

  public setNowcastState(enabled: boolean, status?: string): void {
    this.nowcastEnabled = enabled;
    const button = this.container.querySelector<HTMLButtonElement>('#nowcast-toggle');
    if (!button) return;
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? 'NOWCAST ON' : 'NOWCAST OFF';
    button.title = status || (enabled ? '空港ナウキャストを閉じる' : '出発・到着空港のナウキャストを表示');
    this.container.querySelectorAll<HTMLButtonElement>('.nowcast-3d-time-btn,.nowcast-3d-layer-btn').forEach(btn=>{
      btn.disabled=!enabled;
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
        <!-- Mobile quick actions -->
        <div class="mobile-control-row">
          <button id="mobile-departures-btn" class="toolbar-btn mobile-only-btn" title="便一覧を開く">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            <span>便一覧</span>
          </button>
          <button id="mobile-map-controls-btn" class="toolbar-btn mobile-only-btn" type="button" aria-expanded="false">
            <span>📷</span><span>カメラ</span>
          </button>
        </div>

        <div class="map-controls-body">
        <!-- Aircraft Model -->
        <div class="toolbar-group aircraft-model-group">
          <span class="group-label">AIRCRAFT</span>
          <select id="aircraft-model-select" class="aircraft-model-select" aria-label="表示する航空機モデル">
            ${AIRCRAFT_MODELS.map(model => `<option value="${model.url}" ${model.url === this.currentAircraftModelUrl ? 'selected' : ''}>${model.label}</option>`).join('')}
          </select>
        </div>

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

        <!-- Aviation Weather -->
        <div class="toolbar-group">
          <span class="group-label">WEATHER</span>
          <div class="segmented-control">
            <button id="sigmet-toggle" class="map-layer-btn sigmet-toggle-btn active" type="button" aria-pressed="true" title="航路周辺のSIGMETを表示中">
              SIGMET ON
            </button>
            <button id="nowcast-toggle" class="map-layer-btn nowcast-toggle-btn active" type="button" aria-pressed="true" title="出発・到着空港のナウキャストを表示中">
              NOWCAST ON
            </button>
          </div>
          <div class="nowcast-3d-control">
            <span class="nowcast-3d-label">3D気象</span>
            <div class="segmented-control nowcast-3d-layer-group" aria-label="3D気象レイヤー">
              <button class="map-layer-btn nowcast-3d-layer-btn active" data-nowcast-layer="rain" type="button" aria-pressed="true" title="3D降水の表示・非表示">雨</button>
              <button class="map-layer-btn nowcast-3d-layer-btn active" data-nowcast-layer="thunder" type="button" aria-pressed="true" title="3D雷活動度の表示・非表示">雷</button>
              <button class="map-layer-btn nowcast-3d-layer-btn active" data-nowcast-layer="tornado" type="button" aria-pressed="true" title="3D竜巻発生確度の表示・非表示">竜巻</button>
            </div>
            <div class="segmented-control">
              <button class="map-layer-btn nowcast-3d-time-btn active" data-nowcast-time="current" type="button" title="現在の3D気象を表示">NOW</button>
              <button class="map-layer-btn nowcast-3d-time-btn" data-nowcast-time="forecast60" type="button" title="約60分後の3D気象を表示">+60分</button>
            </div>
            <span class="nowcast-3d-note">出発・到着空港の周辺30kmのみ · 高さ=降水強度/危険度の視覚表現（実際の雲・雷・竜巻の高さではありません）</span>
          </div>
          <div class="nowcast-rain-legend" aria-label="NOWCAST 3D気象凡例">
            <span><i class="rain3d weak"></i>雨 1–5</span>
            <span><i class="rain3d rain"></i>5–10</span>
            <span><i class="rain3d moderate"></i>10–20</span>
            <span><i class="rain3d strong"></i>20–30</span>
            <span><i class="rain3d heavy"></i>30–50</span>
            <span><i class="rain3d severe"></i>50+ mm/h</span>
            <span><i class="weather3d thunder"></i>雷 活動度1–4</span>
            <span><i class="weather3d tornado"></i>竜巻 発生確度1–2</span>
          </div>
          <div class="sigmet-source-note">
            日本(RJJJ): 発表 JMA(RJTD) / 配信 NOAA Aviation Weather Center
          </div>
          <div class="sigmet-color-legend" aria-label="SIGMET色凡例">
            <span><i class="sigmet-color turb"></i>乱気流</span>
            <span><i class="sigmet-color ice"></i>着氷</span>
            <span><i class="sigmet-color ash"></i>火山灰</span>
            <span><i class="sigmet-color tc"></i>台風/熱帯低気圧</span>
            <span><i class="sigmet-color mtw"></i>山岳波</span>
            <span><i class="sigmet-color other"></i>その他/雷雨等</span>
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
          <span class="group-label">ROTATE</span>
          <div class="segmented-control">
            <button class="rotate-view-btn" data-rotate="90" title="現在の視点を90°回転">90°</button>
            <button class="rotate-view-btn" data-rotate="180" title="現在の視点を180°回転">180°</button>
            <button class="rotate-view-btn" data-rotate="270" title="現在の視点を270°回転">270°</button>
            <button class="rotate-view-btn" data-rotate="360" title="現在の視点を約5秒で一回転">360°</button>
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
      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const aircraftSelect = this.container.querySelector<HTMLSelectElement>('#aircraft-model-select');
    if (aircraftSelect) {
      aircraftSelect.addEventListener('change', () => {
        this.setAircraftModel(aircraftSelect.value);
        this.handlers.onAircraftModelChange(aircraftSelect.value);
      });
    }

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

    const sigmetBtn = this.container.querySelector<HTMLButtonElement>('#sigmet-toggle');
    if (sigmetBtn) {
      sigmetBtn.addEventListener('click', () => {
        this.sigmetEnabled = !this.sigmetEnabled;
        this.setSigmetState(this.sigmetEnabled, this.sigmetEnabled ? 'SIGMET 読込中…' : 'SIGMET OFF');
        this.handlers.onSigmetToggle?.(this.sigmetEnabled);
      });
    }

    const nowcastBtn = this.container.querySelector<HTMLButtonElement>('#nowcast-toggle');
    if (nowcastBtn) {
      nowcastBtn.addEventListener('click', () => {
        this.nowcastEnabled = !this.nowcastEnabled;
        this.setNowcastState(this.nowcastEnabled, this.nowcastEnabled ? 'ナウキャスト読込中…' : 'NOWCAST OFF');
        this.handlers.onNowcastToggle?.(this.nowcastEnabled);
      });
    }

    this.container.querySelectorAll<HTMLButtonElement>('.nowcast-3d-layer-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        if(!this.nowcastEnabled)return;
        const layer=btn.dataset.nowcastLayer as 'rain'|'thunder'|'tornado'|undefined;
        if(!layer)return;
        const enabled=!this.nowcast3DLayers[layer];
        this.nowcast3DLayers[layer]=enabled;
        btn.classList.toggle('active',enabled);
        btn.setAttribute('aria-pressed',String(enabled));
        this.handlers.onNowcast3DLayerToggle?.(layer,enabled);
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('.nowcast-3d-time-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        if(!this.nowcastEnabled)return;
        const mode=btn.dataset.nowcastTime==='forecast60'?'forecast60':'current';
        this.container.querySelectorAll('.nowcast-3d-time-btn').forEach(other=>other.classList.toggle('active',other===btn));
        this.handlers.onNowcast3DTimeChange?.(mode);
      });
    });

    const mobileControlsBtn = this.container.querySelector<HTMLButtonElement>('#mobile-map-controls-btn');
    const toolbar = this.container.querySelector('.map-controls-toolbar');
    if (mobileControlsBtn && toolbar) {
      mobileControlsBtn.addEventListener('click', () => {
        const open = !toolbar.classList.contains('mobile-open');
        toolbar.classList.toggle('mobile-open', open);
        mobileControlsBtn.setAttribute('aria-expanded', String(open));
        mobileControlsBtn.querySelector('span:last-child')!.textContent = open ? '閉じる' : 'カメラ';
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

    const rotateButtons = this.container.querySelectorAll<HTMLButtonElement>('.rotate-view-btn');
    rotateButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const degrees = Number(btn.dataset.rotate || 360);
        if (this.handlers.onRotateView) this.handlers.onRotateView(degrees);
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
