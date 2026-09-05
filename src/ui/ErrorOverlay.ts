/**
 * Error Overlay Component
 * Provides user-visible diagnostics for missing API keys, WebGL support, and load failures.
 */

export type ErrorType =
  | 'MISSING_API_KEY'
  | 'MAPS_LOAD_FAILED'
  | 'GLB_LOAD_FAILED'
  | 'WEBGL_UNSUPPORTED'
  | 'GENERIC_ERROR';

export interface ErrorDetails {
  type: ErrorType;
  title: string;
  message: string;
  remedy: string;
}

export class ErrorOverlay {
  private element: HTMLElement | null = null;

  public showError(details: ErrorDetails): void {
    if (this.element) {
      this.element.remove();
    }

    this.element = document.createElement('div');
    this.element.className = 'error-overlay';
    this.element.innerHTML = `
      <div class="error-modal">
        <div class="error-icon-wrapper">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF4D4D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 class="error-title">${details.title}</h2>
        <p class="error-message">${details.message}</p>
        <div class="error-remedy-box">
          <div class="remedy-header">Action Required:</div>
          <div class="remedy-content">${details.remedy}</div>
        </div>
        <button class="error-retry-btn" onclick="window.location.reload()">
          再読み込み (Reload)
        </button>
      </div>
    `;

    document.body.appendChild(this.element);
  }

  public static showMissingKey(): void {
    const overlay = new ErrorOverlay();
    overlay.showError({
      type: 'MISSING_API_KEY',
      title: 'Google Maps API key is not configured',
      message: 'Google Maps Platform Photorealistic 3D Maps の利用には有効なAPIキーが必要です。',
      remedy: `
        1. プロジェクト直下に <code>.env.local</code> を作成または確認してください。<br>
        2. <code>VITE_GOOGLE_MAPS_API_KEY=YOUR_API_KEY</code> を設定してください。<br>
        3. Google Cloud Console で <b>Maps JavaScript API</b> と <b>3D Map Tiles</b> が有効になっていることを確認してください。
      `,
    });
  }

  public static showGLBError(url: string): void {
    const overlay = new ErrorOverlay();
    overlay.showError({
      type: 'GLB_LOAD_FAILED',
      title: '3D Aircraft Model Load Failure',
      message: `旅客機モデル (<code>${url}</code>) の読み込みに失敗しました。`,
      remedy: `
        <code>public/models/skyroute_787_10.glb</code> が存在し、HTTP 200 で配信されているか確認してください。
      `,
    });
  }
}

