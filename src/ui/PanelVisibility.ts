/** Independent controls remain available even when every panel is hidden. */
export class PanelVisibility {
  constructor() {
    const app = document.getElementById('app')!;
    const toolbar = document.createElement('nav');
    toolbar.id = 'panel-visibility-controls';
    toolbar.setAttribute('aria-label', '表示パネルの切替');
    const panels = [
      ['flight-panel-root', '便一覧'],
      ['flight-info-root', '飛行情報'],
      ['map-controls-container', 'カメラ'],
      ['playback-container', '再生バー'],
    ];
    panels.forEach(([id, label]) => {
      const panel = document.getElementById(id)!;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-controls', id);
      button.setAttribute('aria-pressed', 'true');
      button.title = `${label}の表示・非表示`;
      button.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        button.setAttribute('aria-pressed', String(!panel.hidden));
        app.classList.toggle('sidebar-hidden', panels.slice(0, 2).every(
          ([panelId]) => document.getElementById(panelId)!.hidden
        ));
      });
      toolbar.append(button);
    });
    app.append(toolbar);
    const playback = document.getElementById('playback-container')!;
    new ResizeObserver(() => {
      app.style.setProperty('--playback-height', `${playback.getBoundingClientRect().height}px`);
    }).observe(playback);
  }
}
