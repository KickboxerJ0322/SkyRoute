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

      // All available panels start enabled. Content-driven overlays may remain
      // hidden until a flight/route gives them something meaningful to show.
      panel.classList.remove('panel-user-hidden');
      if (!isOverlay) panel.hidden = false;
      button.setAttribute('aria-pressed', 'true');

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
        requestAnimationFrame(()=>syncMobilePanelHeights());
      });
      panelButtons.append(button);
    };

    corePanels.forEach(([id,label]) => addButton(id,label,false));
    overlayPanels.forEach(([id,label]) => addButton(id,label,true));

    app.classList.remove('sidebar-hidden');
    topBar.append(toolbar);

    // Mobile uses one scrollable panel stack in the lower half of the screen.
    // Moving the real panel nodes prevents the many historic absolute-position
    // rules from competing with one another. Desktop restores their original
    // DOM parents and keeps the existing layout unchanged.
    const stack = document.createElement('section');
    stack.id = 'mobile-panel-stack';
    stack.setAttribute('aria-label', 'SkyRoute information panels');
    stack.hidden = true;
    app.append(stack);

    const stackIds = [
      'flight-panel-root',
      'flight-info-root',
      'map-controls-container',
      'playback-container',
      'flight-map-status',
      'route-legend',
      'nowcast-panel',
    ] as const;

    const originalLocations = new Map<string,{parent:Node;next:Node|null}>();
    stackIds.forEach(id => {
      const node = document.getElementById(id);
      if (node?.parentNode) {
        originalLocations.set(id,{parent:node.parentNode,next:node.nextSibling});
      }
    });

    let sizeSyncFrame=0;
    const syncMobilePanelHeights = () => {
      cancelAnimationFrame(sizeSyncFrame);
      sizeSyncFrame=requestAnimationFrame(()=>{
        if(!media.matches)return;
        const measuredIds=['flight-panel-root','flight-info-root','map-controls-container','playback-container'] as const;
        measuredIds.forEach(id=>{
          const node=document.getElementById(id) as HTMLElement|null;
          if(!node||node.hidden||node.classList.contains('panel-user-hidden')){
            node?.style.removeProperty('--mobile-stack-content-height');
            return;
          }
          const content=node.firstElementChild as HTMLElement|null;
          if(!content){
            node.style.removeProperty('--mobile-stack-content-height');
            return;
          }
          const rect=content.getBoundingClientRect();
          const height=Math.ceil(Math.max(rect.height,content.offsetHeight,1));
          node.style.setProperty('--mobile-stack-content-height',`${height}px`);
        });
      });
    };

    const media = window.matchMedia('(max-width: 768px)');
    const applyResponsiveLayout = (mobile:boolean) => {
      if (mobile) {
        stack.hidden = false;
        stackIds.forEach(id => {
          const node = document.getElementById(id);
          if (node && node.parentNode !== stack) stack.append(node);
        });
        app.classList.add('mobile-stacked-panels');
        syncMobilePanelHeights();
      } else {
        stackIds.forEach(id => {
          const node = document.getElementById(id);
          const location = originalLocations.get(id);
          if (!node || !location || node.parentNode !== stack) return;
          if (location.next && location.next.parentNode === location.parent) {
            location.parent.insertBefore(node,location.next);
          } else {
            location.parent.appendChild(node);
          }
        });
        stack.hidden = true;
        app.classList.remove('mobile-stacked-panels');
        stackIds.forEach(id=>document.getElementById(id)?.style.removeProperty('--mobile-stack-content-height'));
      }
    };
    applyResponsiveLayout(media.matches);
    media.addEventListener('change', event => applyResponsiveLayout(event.matches));

    const contentObserver=new MutationObserver(()=>syncMobilePanelHeights());
    stackIds.forEach(id=>{
      const node=document.getElementById(id);
      if(node)contentObserver.observe(node,{
        childList:true,
        subtree:true,
        characterData:true,
        attributes:true,
        attributeFilter:['hidden','class'],
      });
    });
    window.addEventListener('resize',syncMobilePanelHeights,{passive:true});
    window.setTimeout(syncMobilePanelHeights,0);

    const playback = document.getElementById('playback-container')!;
    new ResizeObserver(() => {
      app.style.setProperty('--playback-height', `${playback.getBoundingClientRect().height}px`);
    }).observe(playback);
  }
}
