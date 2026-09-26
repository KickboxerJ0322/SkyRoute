/** Independent controls remain available even when every panel is hidden. */
export class PanelVisibility {
  constructor() {
    const app = document.getElementById('app')!;
    const topBar = document.getElementById('top-app-bar') ?? app;
    const toolbar = document.createElement('nav');
    toolbar.id = 'panel-visibility-controls';
    toolbar.setAttribute('aria-label', '表示パネルの切替');

    const mobileToggle = document.createElement('button');
    mobileToggle.type = 'button';
    mobileToggle.id = 'panel-visibility-menu-toggle';
    mobileToggle.className = 'panel-visibility-menu-toggle';
    mobileToggle.textContent = '操作';
    mobileToggle.setAttribute('aria-expanded', 'false');
    mobileToggle.addEventListener('click', () => {
      const open = toolbar.classList.toggle('mobile-menu-open');
      mobileToggle.setAttribute('aria-expanded', String(open));
      mobileToggle.textContent = open ? '閉じる' : '操作';
    });
    toolbar.append(mobileToggle);

    const panelButtons = document.createElement('div');
    panelButtons.className = 'panel-visibility-items';
    toolbar.append(panelButtons);

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const corePanels = [
      ['flight-panel-root', '便一覧'],
      ['flight-info-root', '飛行情報'],
      ['map-controls-container', 'カメラ'],
      ['playback-container', '再生バー'],
    ] as const;
    const overlayPanels = [
      ['flight-map-status', '高度・時間'],
      ['route-legend', 'ルート色'],
    ] as const;

    const addButton = (id:string,label:string,isOverlay=false) => {
      const panel = document.getElementById(id)!;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-controls', id);
      button.title = `${label}の表示・非表示`;

      const initiallyVisible = !isMobile;
      panel.classList.toggle('panel-user-hidden', !initiallyVisible);
      if (!isOverlay) panel.hidden = !initiallyVisible;
      button.setAttribute('aria-pressed', String(initiallyVisible));

      button.addEventListener('click', () => {
        const visible = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(visible));
        panel.classList.toggle('panel-user-hidden', !visible);

        if (isOverlay) {
          document.dispatchEvent(new CustomEvent('skyroute-panel-visibility', {
            detail: { id, visible },
          }));
        } else {
          panel.hidden = !visible;
        }

        app.classList.toggle('sidebar-hidden', corePanels.slice(0, 2).every(
          ([panelId]) => document.getElementById(panelId)!.hidden
        ));
      });
      panelButtons.append(button);
    };

    corePanels.forEach(([id,label]) => addButton(id,label,false));
    overlayPanels.forEach(([id,label]) => addButton(id,label,true));

    app.classList.toggle('sidebar-hidden', isMobile);
    topBar.append(toolbar);

    const playback = document.getElementById('playback-container')!;
    new ResizeObserver(() => {
      app.style.setProperty('--playback-height', `${playback.getBoundingClientRect().height}px`);
    }).observe(playback);
  }
}
