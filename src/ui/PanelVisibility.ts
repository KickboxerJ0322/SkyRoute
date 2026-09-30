/** Shared stacked-panel layout for desktop and mobile. */
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

    const panelDefs = [
      {id:'flight-panel-root',label:'便一覧',contentDriven:false,placeholder:'便一覧を表示します'},
      {id:'flight-info-root',label:'飛行情報',contentDriven:false,placeholder:'便を選択すると飛行情報を表示します'},
      {id:'map-controls-container',label:'カメラ',contentDriven:false,placeholder:'カメラ・地図・気象操作を表示します'},
      {id:'playback-container',label:'再生バー',contentDriven:false,placeholder:'Preview / Replay の再生操作を表示します'},
      {id:'flight-map-status',label:'高度・時間',contentDriven:true,placeholder:'便を選択すると高度・残距離・残時間を表示します'},
      {id:'route-legend',label:'ルート色',contentDriven:true,placeholder:'ルート表示時に ACTUAL / FILED / ESTIMATED の凡例を表示します'},
      {id:'nowcast-panel',label:'NOWCAST',contentDriven:true,placeholder:'NOWCAST ONで出発・到着空港の気象情報を表示します'},
    ] as const;

    const visibleById = new Map<string,boolean>(panelDefs.map(def=>[def.id,true]));
    const buttonById = new Map<string,HTMLButtonElement>();
    const cardById = new Map<string,HTMLElement>();

    const stack = document.createElement('section');
    stack.id = 'mobile-panel-stack';
    stack.setAttribute('aria-label', 'SkyRoute information panels');
    stack.hidden = false;
    app.append(stack);

    const media = window.matchMedia('(max-width: 768px)');

    const syncCardContentState = (id:string) => {
      const node=document.getElementById(id);
      const card=cardById.get(id);
      if(!node||!card)return;
      card.dataset.contentHidden=String(node.hidden);
    };

    const applyVisibility = (id:string,visible:boolean) => {
      visibleById.set(id,visible);
      const def=panelDefs.find(item=>item.id===id);
      const node=document.getElementById(id);
      const card=cardById.get(id);
      const button=buttonById.get(id);
      if(!def||!node)return;

      button?.setAttribute('aria-pressed',String(visible));
      node.classList.toggle('panel-user-hidden',!visible);
      if(card)card.hidden=!visible;

      // Wrapper cards own visibility. Keep core panel roots mounted so old
      // display!important declarations cannot defeat user hide/show controls.
      if(!def.contentDriven)node.hidden=false;

      if(def.contentDriven){
        document.dispatchEvent(new CustomEvent('skyroute-panel-visibility',{
          detail:{id,visible},
        }));
      }

      const firstTwoHidden=['flight-panel-root','flight-info-root'].every(panelId=>!visibleById.get(panelId));
      app.classList.toggle('sidebar-hidden',firstTwoHidden);
      syncCardContentState(id);
    };

    panelDefs.forEach(def=>{
      const node=document.getElementById(def.id);
      if(!node)return;
      if(!def.contentDriven)node.hidden=false;
      node.classList.remove('panel-user-hidden');

      const button=document.createElement('button');
      button.type='button';
      button.textContent=def.label;
      button.setAttribute('aria-controls',def.id);
      button.setAttribute('aria-pressed','true');
      button.title=`${def.label}の表示・非表示`;
      button.addEventListener('click',()=>{
        applyVisibility(def.id,!visibleById.get(def.id));
      });
      buttonById.set(def.id,button);
      panelButtons.append(button);
    });

    const buildCards=()=>{
      if(cardById.size)return;
      panelDefs.forEach((def,index)=>{
        const node=document.getElementById(def.id);
        if(!node)return;

        const card=document.createElement('section');
        card.className='mobile-panel-card';
        card.dataset.panelId=def.id;
        card.style.order=String(index+1);

        const header=document.createElement('div');
        header.className='mobile-panel-card-title';
        header.textContent=def.label;

        const body=document.createElement('div');
        body.className='mobile-panel-card-body';

        const placeholder=document.createElement('div');
        placeholder.className='mobile-panel-placeholder';
        placeholder.textContent=def.placeholder;

        body.append(node,placeholder);
        card.append(header,body);
        stack.append(card);
        cardById.set(def.id,card);
        syncCardContentState(def.id);
        card.hidden=!visibleById.get(def.id);
      });
    };

    const applyResponsiveLayout=(mobile:boolean)=>{
      buildCards();
      stack.hidden=false;
      app.classList.add('panel-stack-layout');
      app.classList.toggle('mobile-stacked-panels',mobile);
      app.classList.toggle('desktop-stacked-panels',!mobile);
      panelDefs.forEach(def=>applyVisibility(def.id,visibleById.get(def.id)!==false));
    };

    applyResponsiveLayout(media.matches);
    media.addEventListener('change',event=>applyResponsiveLayout(event.matches));

    const observer=new MutationObserver(records=>{
      const ids=new Set<string>();
      records.forEach(record=>{
        const target=record.target as HTMLElement;
        const root=panelDefs.find(def=>target.id===def.id || target.closest?.('#'+def.id));
        if(root)ids.add(root.id);
      });
      ids.forEach(id=>syncCardContentState(id));
    });

    panelDefs.forEach(def=>{
      const node=document.getElementById(def.id);
      if(node)observer.observe(node,{
        attributes:true,
        attributeFilter:['hidden','class'],
        subtree:true,
        childList:true,
      });
    });

    topBar.append(toolbar);

    const playback = document.getElementById('playback-container')!;
    new ResizeObserver(() => {
      app.style.setProperty('--playback-height', `${playback.getBoundingClientRect().height}px`);
    }).observe(playback);
  }
}
