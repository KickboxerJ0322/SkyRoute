import type { NightMode } from '../map/NightMode';

/** Weather controls remain mounted independently of NOWCAST data refreshes. */
export interface WeatherControlsHandlers {
  onNightModeChange?: (mode: NightMode) => void;
  onSigmetToggle?: (enabled: boolean) => void;
  onNowcastToggle?: (enabled: boolean) => void;
  onNowcast3DTimeChange?: (mode: 'current' | 'forecast60') => void;
  onNowcast3DLayerToggle?: (layer: 'rain' | 'thunder' | 'tornado', enabled: boolean) => void;
}
export class WeatherControls {
  private sigmetEnabled = true;
  private nowcastEnabled = true;
  private nowcast3DLayers: Record<'rain'|'thunder'|'tornado',boolean> = {
    rain:true,
    thunder:true,
    tornado:true,
  };

  constructor(private container: HTMLElement, private handlers: WeatherControlsHandlers) {
    this.container.innerHTML = `
        <div class="night-control">
          <span class="group-label">夜間：</span>
          <div class="segmented-control" role="group" aria-label="夜間モード">
            <button class="map-layer-btn night-mode-btn active" data-night-mode="auto" type="button" aria-pressed="true" title="日本時間18:00〜翌5:00に自動で夜間表示">自動</button>
            <button class="map-layer-btn night-mode-btn" data-night-mode="on" type="button" aria-pressed="false" title="時刻に関係なく夜間表示にする">ON</button>
            <button class="map-layer-btn night-mode-btn" data-night-mode="off" type="button" aria-pressed="false" title="時刻に関係なく昼間表示にする">OFF</button>
          </div>
          <span id="night-status" class="nowcast-3d-note">日本時間18:00〜翌5:00 · 地図全体を暗く表示</span>
        </div>
        <!-- Aviation Weather -->
        <div class="toolbar-group">
          <span class="group-label">気象レイヤー</span>
          <div class="segmented-control">
            <button id="sigmet-toggle" class="map-layer-btn sigmet-toggle-btn active" type="button" aria-pressed="true" title="航路周辺のSIGMETを表示中">
              SIGMET ON
            </button>
            <button id="nowcast-toggle" class="map-layer-btn nowcast-toggle-btn active" type="button" aria-pressed="true" title="出発・到着空港のナウキャストを表示中">
              NOWCAST ON
            </button>
          </div>
          <div class="nowcast-3d-control">
            <span class="nowcast-3d-label">NOWCAST · 3D気象</span>
            <div class="segmented-control nowcast-3d-layer-group" aria-label="3D気象レイヤー">
              <button class="map-layer-btn nowcast-3d-layer-btn active" data-nowcast-layer="rain" type="button" aria-pressed="true" title="3D降水の表示・非表示">雨</button>
              <button class="map-layer-btn nowcast-3d-layer-btn active" data-nowcast-layer="thunder" type="button" aria-pressed="true" title="3D雷活動度の表示・非表示">雷</button>
              <button class="map-layer-btn nowcast-3d-layer-btn active" data-nowcast-layer="tornado" type="button" aria-pressed="true" title="3D竜巻発生確度の表示・非表示">竜巻</button>
            </div>
            <div class="segmented-control">
              <button class="map-layer-btn nowcast-3d-time-btn active" data-nowcast-time="current" type="button" title="現在の3D気象を表示">NOW</button>
              <button class="map-layer-btn nowcast-3d-time-btn" data-nowcast-time="forecast60" type="button" title="約60分後の3D気象を表示">+60分</button>
            </div>
            <span class="nowcast-3d-note">NOWCAST: 出発・到着空港の周辺30kmのみ · 高さ=降水強度/危険度の視覚表現（実際の雲・雷・竜巻の高さではありません）</span>
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
            SIGMET: 日本(RJJJ): 発表 JMA(RJTD) / 配信 NOAA Aviation Weather Center
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

    `;
    this.attachEventListeners();
  }
  public setNightState(mode: NightMode, dark: boolean, timestamp: number): void {
    this.container.querySelectorAll<HTMLButtonElement>('[data-night-mode]').forEach(button => {
      const selected = button.dataset.nightMode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const time = new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(timestamp);
    this.container.querySelector('#night-status')!.textContent = `表示時刻 ${time} JST · ${dark ? '夜間表示' : '昼間表示'} · 自動 18:00〜翌5:00`;
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

  private attachEventListeners(): void {
    this.container.querySelectorAll<HTMLButtonElement>('[data-night-mode]').forEach(button => {
      button.addEventListener('click', () => {
        const mode = button.dataset.nightMode as NightMode;
        this.container.querySelectorAll<HTMLButtonElement>('[data-night-mode]').forEach(other => {
          other.classList.toggle('active', other === button);
          other.setAttribute('aria-pressed', String(other === button));
        });
        this.handlers.onNightModeChange?.(mode);
      });
    });

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

  }
}
