import { greatCirclePoints } from './liveGeometry';
﻿import { AircraftController } from '../map/AircraftController';
import { RouteRenderer } from '../map/RouteRenderer';
import { CameraController } from '../map/CameraController';
import { DemoFlightProvider } from './DemoFlightProvider';
import { AeroApiFlightProvider, chooseRoute, toAnimationRoute } from './AeroApiFlightProvider';
import { LiveFlightInterpolator } from './LiveFlightInterpolator';
import { FlightAnimator } from './FlightAnimator';
import type { SkyRouteFlight, SkyRoutePosition, SkyRouteRoute, SkyRouteTrackPoint } from './liveTypes';
import { aircraftModelUrlForFlight } from './aircraftModel';
import type { TelemetryData } from './types';
import { FlightPanel } from '../ui/FlightPanel';
import { FlightInfo } from '../ui/FlightInfo';
import { PlaybackControls } from '../ui/PlaybackControls';
import { MapControls } from '../ui/MapControls';
import { PanelVisibility } from '../ui/PanelVisibility';
import { LiveFlightView } from '../ui/LiveFlightView';
import { AIRCRAFT_SCALE_NORMAL, AIRCRAFT_SCALE_OVERVIEW } from '../config';
import { distanceBetween, bearingBetween } from '../utils/geo';

const element=(id:string)=>document.getElementById(id)!;
const errorText=(error:unknown)=>error instanceof Error?error.message:'API_UNAVAILABLE';
const escapeForAi=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class FlightExperience {
  private dataMode:'LIVE'|'DEMO'='LIVE';
  private viewMode:'LIVE'|'PREVIEW'|'REPLAY'='LIVE';
  private provider=new AeroApiFlightProvider();
  private demo=new DemoFlightProvider();
  private demoPanel=new FlightPanel(element('flight-panel-root'));
  private demoInfo=new FlightInfo(element('flight-info-root'));
  private selectedAirport='RJTT';
  private liveView=new LiveFlightView(element('flight-panel-root'),element('flight-info-root'),id=>void this.selectLive(id),icao=>void this.changeAirport(icao));
  private interpolator=new LiveFlightInterpolator();
  private selected:SkyRouteFlight|null=null;
  private route:SkyRouteRoute|null=null;
  private filed:SkyRouteRoute|null=null;
  private track:SkyRouteTrackPoint[]=[];
  private selectionAbort=new AbortController();
  private listAbort=new AbortController();
  private selectionTimer=0;
  private listTimer=0;
  private raf=0;
  private lastFrame=0;
  private lastTrackFetch=0;
  private lastPosition:SkyRoutePosition|null=null;
  private currentTelemetry:TelemetryData|null=null;
  private autoPositionRefresh=false;
  private lastAiCommentary='';
  private lastAiModel='';
  private lastAiCreatedAt='';
  private ttsAudio:HTMLAudioElement|null=null;
  private ttsObjectUrl='';
  private loadingList=false;
  private animator:FlightAnimator;
  private playback:PlaybackControls;
  private statusLabel:HTMLElement;

  constructor(private aircraft:AircraftController,private camera:CameraController,private planned:RouteRenderer,private actual:RouteRenderer, map:any) {
    this.animator=new FlightAnimator(t=>{
      if(this.dataMode==='LIVE'&&this.viewMode==='LIVE')return;
      this.applyTelemetry(t);
      if(this.dataMode==='DEMO')this.demoInfo.updateTelemetry(t);
      else this.liveView.updatePosition({latitude:t.lat,longitude:t.lng,altitudeMeters:t.altitude,heading:t.heading,groundSpeedKmh:t.speedKmh,timestamp:new Date().toISOString(),altitudeEstimated:true});
      this.playback?.setProgress(t.progress);this.playback?.setPlayingState(this.animator.getIsPlaying(),this.animator.getDirection());
    });
    this.playback=new PlaybackControls(element('playback-container'),{
      onTogglePlay:()=>{this.animator.togglePlay();this.syncPlayback();},onToggleReverse:()=>{this.animator.toggleReverse();this.syncPlayback();},
      onRestart:()=>{this.animator.restart();this.syncPlayback();},onSpeedChange:speed=>this.animator.setSpeed(speed),onSeek:progress=>this.animator.seek(progress),
    });
    const controls=new MapControls(element('map-controls-container'),{
      onMapModeChange:mode=>{map.mode=mode;},onCameraModeChange:mode=>{this.camera.setMode(mode);this.refreshCamera();},
      onOffsetChange:heading=>{this.camera.setHeadingOffset(heading);this.refreshCamera();},onTiltChange:tilt=>{this.camera.setTilt(tilt);this.refreshCamera();},
      onOpenMobileDepartures:()=>element('flight-panel-root').querySelector('.flight-panel')?.classList.toggle('open-mobile'),
    });
    this.camera.onModeChange(mode=>{controls.setCameraMode(mode);this.aircraft.setScale(mode==='OVERVIEW'?AIRCRAFT_SCALE_OVERVIEW:AIRCRAFT_SCALE_NORMAL);});
    new PanelVisibility();
    const toolbar=element('panel-visibility-controls');
    const modes=document.createElement('div');modes.className='data-mode-controls';
    modes.innerHTML='<button id="data-live" aria-pressed="true">LIVE</button><button id="data-demo" aria-pressed="false">DEMO</button><button id="refresh-flights">更新</button><span id="data-source-status" role="status">「更新」を押すと便一覧を取得します</span>';
    const toolbarItems=toolbar.querySelector('.panel-visibility-items') ?? toolbar;
    toolbarItems.append(modes);this.statusLabel=element('data-source-status');
    element('data-live').onclick=()=>void this.setMode('LIVE');element('data-demo').onclick=()=>void this.setMode('DEMO');
    element('refresh-flights').onclick=()=>void this.refreshList();
    const topBar=document.getElementById('top-app-bar')||toolbar;
    new ResizeObserver(()=>element('app').style.setProperty('--top-controls-height',topBar.getBoundingClientRect().height+'px')).observe(topBar);
    this.demoPanel.onSelect(id=>void this.selectDemo(id));
    window.addEventListener('pagehide',()=>this.stop());
  }
  async start() {await this.setMode('LIVE');}
  private syncPlayback() {this.playback.setPlayingState(this.animator.getIsPlaying(),this.animator.getDirection());}
  private refreshCamera() {if(this.currentTelemetry)this.camera.update(this.currentTelemetry);}
  private applyTelemetry(t:TelemetryData) {this.currentTelemetry=t;this.aircraft.setVisible(true);this.aircraft.update(t);this.camera.update(t);}
  private enablePlayback(enabled:boolean) {
    const root=element('playback-container');root.classList.toggle('playback-live',!enabled);
    root.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button,input').forEach(el=>el.disabled=!enabled);
    root.setAttribute('aria-label',enabled?'Flight playback':'LIVE mode: choose Preview or Replay to use playback');
  }
  private cancelSelection() {
    this.selectionAbort.abort();this.selectionAbort=new AbortController();clearTimeout(this.selectionTimer);this.autoPositionRefresh=false;this.lastAiCommentary='';this.lastAiModel='';this.lastAiCreatedAt='';this.stopAiSpeech();cancelAnimationFrame(this.raf);this.raf=0;
    this.animator.pause();this.syncPlayback();this.interpolator.reset();this.lastPosition=null;this.currentTelemetry=null;
    this.route=null;this.filed=null;this.track=[];this.planned.clear();this.actual.clear();this.aircraft.setVisible(false);
  }
  private stop() {this.cancelSelection();this.listAbort.abort();clearTimeout(this.listTimer);}
  async setMode(mode:'LIVE'|'DEMO') {
    this.stop();this.dataMode=mode;this.viewMode='LIVE';this.selected=null;this.listAbort=new AbortController();this.loadingList=false;
    this.aircraft.setModel(aircraftModelUrlForFlight(null));
    element('data-live').setAttribute('aria-pressed',String(mode==='LIVE'));element('data-demo').setAttribute('aria-pressed',String(mode==='DEMO'));
    (element('refresh-flights') as HTMLButtonElement).disabled=mode==='DEMO';
    this.enablePlayback(mode==='DEMO');
    if(mode==='DEMO') {
      this.statusLabel.textContent='DEMO · Simulated flight';
      const departures=await this.demo.getDepartures();if(this.dataMode!=='DEMO')return;
      this.demoPanel.setDepartures(departures,departures[0].id);await this.selectDemo(departures[0].id);
    } else {
      element('flight-info-root').innerHTML='<div class="flight-info-hud live-empty">便を選択すると、実データの詳細と航路を表示します。</div>';
      this.liveView.setAirport(this.selectedAirport);this.liveView.showList([],'','空港を選択して「更新」を押すと便一覧を取得します。');this.statusLabel.textContent='「更新」を押すと便一覧を取得します';
    }
  }
  private async changeAirport(icao:string) {
    if(this.dataMode!=='LIVE'||icao===this.selectedAirport)return;
    this.selectedAirport=icao;
    this.cancelSelection();
    this.selected=null;
    this.liveView.setAirport(icao);
    element('flight-info-root').innerHTML='<div class="flight-info-hud live-empty">便を選択すると、実データの詳細と航路を表示します。</div>';
    this.listAbort.abort();this.listAbort=new AbortController();
    this.liveView.showList([],'','空港を選択して「更新」を押すと便一覧を取得します。');
    this.statusLabel.textContent='「更新」を押すと便一覧を取得します';
  }
  private async selectDemo(id:string) {
    this.cancelSelection();const signal=this.selectionAbort.signal;
    const route=await this.demo.getRoute(id);if(signal.aborted||this.dataMode!=='DEMO')return;
    this.demoInfo.setRoute(route);this.planned.setRoute(route.waypoints);this.camera.setRoute(route);
    this.animator.setRoute(route);this.animator.play();this.syncPlayback();this.enablePlayback(true);
  }
  private async refreshList() {
    if(this.dataMode!=='LIVE'||this.loadingList)return;
    clearTimeout(this.listTimer);this.loadingList=true;const signal=this.listAbort.signal;
    (element('refresh-flights') as HTMLButtonElement).disabled=true;
    try {
      await this.provider.getDepartures(signal,this.selectedAirport);if(signal.aborted)return;
      const result=this.provider.lastDepartures!;
      const flights=result.data.filter(f=>f.status==='ENROUTE'||Date.parse(f.scheduledDeparture||'')>=Date.now());
      this.liveView.showList(flights,this.selected?.id||'',result.warning?result.warning:result.stale?'LIVE DATA TEMPORARILY UNAVAILABLE · cached data':result.source==='mock'?'MOCK · 架空の検証データ（実際の運航情報ではありません）':'FlightAware · LIVE');
      this.updateSource(result.stale?' · cached data':'');
    } catch(error) {if(!signal.aborted){this.liveView.showList([],'','LIVE DATA TEMPORARILY UNAVAILABLE · '+errorText(error)+' · DEMOを利用できます');this.statusLabel.textContent='LIVE DATA TEMPORARILY UNAVAILABLE';}}
    finally {if(!signal.aborted){this.loadingList=false;(element('refresh-flights') as HTMLButtonElement).disabled=false;}}
  }
  private updateSource(suffix='') {this.statusLabel.textContent=`${this.dataMode==='DEMO'?'DEMO':this.provider.source==='mock'?'MOCK':'● LIVE'}${this.viewMode==='LIVE'?'':' · '+this.viewMode}${suffix}`;}
  public async inspectLiveFlight(flight:SkyRouteFlight) {
    await this.selectLive(flight.id,flight);
  }
  private async selectLive(id:string,seed?:SkyRouteFlight) {
    this.cancelSelection();this.viewMode='LIVE';this.enablePlayback(false);this.updateSource();
    this.selected=seed||this.provider.lastDepartures?.data.find(f=>f.id===id)||null;
    if(!this.selected)return;
    this.aircraft.setModel(aircraftModelUrlForFlight(this.selected));
    this.liveView.showFlight(this.selected,this.provider.source==='mock'?'MOCK':'LIVE');this.bindFlightActions();
    const signal=this.selectionAbort.signal;
    try {
      try {const detail=await this.provider.getFlight(id,signal);if(signal.aborted)return;this.selected=detail.data;this.aircraft.setModel(aircraftModelUrlForFlight(this.selected));}
      catch(error) {if(signal.aborted)return;this.liveView.setMessage(errorText(error));}
      const [origin,destination]=await Promise.all([this.provider.resolveAirport(this.selected.origin,signal),this.provider.resolveAirport(this.selected.destination,signal)]);
      if(signal.aborted)return;this.selected={...this.selected,origin,destination};
      this.liveView.showFlight(this.selected,this.provider.source==='mock'?'MOCK':'LIVE');this.bindFlightActions();
      const [filed,track]=await Promise.allSettled([this.provider.getFiledRoute(id,signal),this.provider.getTrack(id,signal)]);
      if(signal.aborted)return;
      this.filed=filed.status==='fulfilled'?filed.value.data:null;this.track=track.status==='fulfilled'?track.value.data:[];this.lastTrackFetch=Date.now();
      this.rebuildRoutes();this.placeStationary();
      if(this.selected.status==='ENROUTE')this.liveView.setMessage('「現在位置更新」を押すと現在位置を取得します。');
      else this.liveView.setMessage((this.route!.waypoints.length<2?'Route unavailable. ':'')+(this.selected.status==='CANCELLED'?'Cancelled · 飛行アニメーションは停止しています。':this.selected.status==='ARRIVED'?'Arrived':'Scheduled · Position not available yet.'));
      if(!signal.aborted)this.scheduleSelection();
    } catch(error) {if(!signal.aborted){this.liveView.setMessage(errorText(error)+' · DEMOを利用できます');this.scheduleSelection();}}
  }
  private bindFlightActions() {
    const root=element('flight-info-root');
    root.querySelector('#live-return')!.addEventListener('click',()=>void this.returnLive());
    root.querySelector('#live-refresh-position')?.addEventListener('click',()=>void this.refreshSelectedNow());
    const autoButton=root.querySelector<HTMLButtonElement>('#live-auto-refresh');if(autoButton){autoButton.disabled=true;autoButton.title='AeroAPI節約のため自動更新は無効です';}
    root.querySelector('#live-preview')!.addEventListener('click',()=>this.startPreview(false));
    root.querySelector('#live-replay')!.addEventListener('click',()=>this.startPreview(true));
    root.querySelector('#live-ai')?.addEventListener('click',()=>void this.requestAiCommentary());
    root.querySelector('#live-speak')?.addEventListener('click',()=>void this.speakAiCommentary());
    root.querySelector('#live-stop-speak')?.addEventListener('click',()=>this.stopAiSpeech());
    this.syncAutoRefreshButton();
    this.restoreAiCommentary();
  }
  private syncAutoRefreshButton() {
    const button=element('flight-info-root').querySelector<HTMLButtonElement>('#live-auto-refresh');
    if(!button)return;
    button.setAttribute('aria-pressed',String(this.autoPositionRefresh));
    button.textContent=this.autoPositionRefresh?'自動更新 ON':'自動更新 OFF';
  }
  private restoreAiCommentary() {
    if(!this.lastAiCommentary)return;
    const root=element('flight-info-root');
    const panel=root.querySelector<HTMLElement>('#live-ai-commentary');
    const modelNote=root.querySelector<HTMLElement>('#live-ai-model-note');
    if(panel){
      panel.hidden=false;
      const plain=this.lastAiCommentary.replace(/\*\*/g,'');
      panel.innerHTML=`<div class="live-ai-text">${escapeForAi(plain).replace(/\n/g,'<br>')}</div>`;
    }
    if(modelNote){
      const created=this.lastAiCreatedAt?new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit'}).format(new Date(this.lastAiCreatedAt)):'';
      modelNote.hidden=false;
      modelNote.textContent=`AIモデル: ${this.lastAiModel}${created?' · 作成 '+created:''}`;
    }
  }
  private async speakAiCommentary() {
    if(!this.lastAiCommentary)return;
    this.stopAiSpeech();
    const button=element('flight-info-root').querySelector<HTMLButtonElement>('#live-speak');
    if(button){button.disabled=true;button.textContent='音声生成中…';}
    try {
      const response=await fetch('/api/tts',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:this.lastAiCommentary.replace(/\*\*/g,'')}),
      });
      if(!response.ok)throw new Error('TTS_UNAVAILABLE');
      const blob=await response.blob();
      this.ttsObjectUrl=URL.createObjectURL(blob);
      this.ttsAudio=new Audio(this.ttsObjectUrl);
      this.ttsAudio.onended=()=>this.stopAiSpeech(false);
      await this.ttsAudio.play();
    } catch {
      this.liveView.setMessage('音声を生成できませんでした。Cloud Text-to-Speech の設定を確認してください。');
    } finally {
      const current=element('flight-info-root').querySelector<HTMLButtonElement>('#live-speak');
      if(current){current.disabled=false;current.textContent='🔊 音声';}
    }
  }
  private stopAiSpeech(resetMessage=true) {
    if(this.ttsAudio){this.ttsAudio.pause();this.ttsAudio.currentTime=0;this.ttsAudio=null;}
    if(this.ttsObjectUrl){URL.revokeObjectURL(this.ttsObjectUrl);this.ttsObjectUrl='';}
    if(resetMessage&&this.lastAiCommentary)this.liveView.setMessage('音声を停止しました。');
  }
  private async refreshSelectedNow() {
    if(!this.selected||this.viewMode!=='LIVE')return;
    const button=element('flight-info-root').querySelector<HTMLButtonElement>('#live-refresh-position');
    if(button){button.disabled=true;button.textContent='更新中…';}
    try {await this.pollSelection();}
    finally {const current=element('flight-info-root').querySelector<HTMLButtonElement>('#live-refresh-position');if(current){current.disabled=false;current.textContent='現在位置更新';}}
  }
  private async requestAiCommentary() {
    if(!this.selected)return;
    const root=element('flight-info-root');
    const button=root.querySelector<HTMLButtonElement>('#live-ai');
    const panel=root.querySelector<HTMLElement>('#live-ai-commentary');
    if(!button||!panel)return;
    button.disabled=true;button.textContent='AI解析中…';panel.hidden=false;panel.textContent='AeroAPIの運航データをGeminiで解析しています…';
    const sample=<T>(items:T[],max=28)=>items.length<=max?items:Array.from({length:max},(_,i)=>items[Math.round(i*(items.length-1)/(max-1))]);
    let weather:{origin:unknown;destination:unknown}={origin:null,destination:null};
    try {
      const originCode=this.selected.origin.icao;
      const destinationCode=this.selected.destination.icao;
      const [originWeather,destinationWeather]=await Promise.allSettled([
        originCode?this.provider.getWeather(originCode):Promise.resolve(null),
        destinationCode?this.provider.getWeather(destinationCode):Promise.resolve(null),
      ]);
      weather={
        origin:originWeather.status==='fulfilled'&&originWeather.value?originWeather.value.data:null,
        destination:destinationWeather.status==='fulfilled'&&destinationWeather.value?destinationWeather.value.data:null,
      };
    } catch {}
    const payload={
      observedAt:new Date().toISOString(),
      flight:this.selected,
      currentPosition:this.lastPosition,
      currentDerived:this.currentTelemetry?{
        distanceRemainingKm:this.currentTelemetry.distanceRemainingKm,
        flightPhase:this.currentTelemetry.flightPhase,
      }:null,
      route:{
        selectedType:this.route?.type??null,
        filedRouteAvailable:!!this.filed?.waypoints.length,
        textualRoute:this.selected.filedRouteText??null,
        actualTrackPointCount:this.track.length,
        filedWaypoints:this.filed?sample(this.filed.waypoints):[],
        actualTrack:sample(this.track),
      },
      weather,
    };
    try {
      const response=await fetch('/api/ai/flight-commentary',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'AI_UNAVAILABLE');
      this.lastAiCommentary=String(body.text||'');
      this.lastAiModel=String(body.model||'');
      this.lastAiCreatedAt=new Date().toISOString();
      this.restoreAiCommentary();
    } catch(error) {
      const code=error instanceof Error?error.message:'AI_UNAVAILABLE';
      panel.textContent=code==='AI_NOT_CONFIGURED'
        ?'Gemini APIキーがまだ設定されていません。設定後、このボタンから解説できます。'
        :code==='AI_RATE_LIMIT'?'Gemini APIの利用上限に達しています。時間をおいて再試行してください。'
        :'AI解説を取得できませんでした。';
    } finally {button.disabled=false;button.textContent='AI解説';}
  }
  private rebuildRoutes() {
    if(!this.selected)return;
    this.route=chooseRoute(this.selected,this.filed,this.track);
    const waypoints=this.route.waypoints.map(p=>({lat:p.latitude,lng:p.longitude,altitude:p.altitudeMeters}));
    this.actual.setRoute(this.track.filter(p=>p.altitudeMeters!==null).map(p=>({lat:p.latitude,lng:p.longitude,altitude:p.altitudeMeters!})),'ACTUAL');
    if(waypoints.length>=2&&!this.currentTelemetry)this.camera.setRoute(toAnimationRoute(this.selected,this.route));
    this.liveView.setRoute(waypoints.length>=2?this.route.type:null,this.track.length>=2);
    this.drawRemainingRoute();
    const cancelled=this.selected.status==='CANCELLED';
    (element('live-preview') as HTMLButtonElement).disabled=cancelled||waypoints.length<2;
    (element('live-replay') as HTMLButtonElement).disabled=cancelled||this.track.filter(p=>p.altitudeMeters!==null).length<2;
    if(waypoints.length<2)this.liveView.setMessage('Route unavailable. Position tracking can continue.');
    this.debug();
  }
  private drawRemainingRoute() {
    if(!this.route)return;
    let points=this.route.type==='ACTUAL'?[]:this.route.waypoints.map(p=>({lat:p.latitude,lng:p.longitude,altitude:p.altitudeMeters}));
    if(this.lastPosition&&points.length>1&&this.lastPosition.altitudeMeters!==null) {
      const current={lat:this.lastPosition.latitude,lng:this.lastPosition.longitude,altitude:this.lastPosition.altitudeMeters};
      const nearest=points.reduce((best,p,i)=>distanceBetween(current,p)<distanceBetween(current,points[best])?i:best,0);
      points=[current,...points.slice(nearest+1)];
    }
    if(this.route.type==='ACTUAL'&&this.lastPosition&&this.selected) {
      const origin={...this.selected.origin,latitude:this.lastPosition.latitude,longitude:this.lastPosition.longitude,altitudeMeters:this.lastPosition.altitudeMeters};
      points=greatCirclePoints(origin,this.selected.destination).map(p=>({lat:p.latitude,lng:p.longitude,altitude:p.altitudeMeters}));
      this.planned.setRoute(points,'ESTIMATED');
      if(points.length>=2)this.liveView.setRoute('ESTIMATED',true);
    } else this.planned.setRoute(points,this.route.type);
  }
  private placeStationary() {
    if(!this.selected||this.viewMode!=='LIVE')return;
    if(this.selected.status==='ENROUTE'){if(!this.lastPosition)this.aircraft.setVisible(false);return;}
    const airport=this.selected.status==='ARRIVED'?this.selected.destination:this.selected.origin;
    if(airport.latitude!==null&&airport.longitude!==null&&airport.altitudeMeters!==null) {
      this.applyPosition({latitude:airport.latitude,longitude:airport.longitude,altitudeMeters:airport.altitudeMeters+5,groundSpeedKmh:null,heading:null,timestamp:new Date().toISOString(),altitudeEstimated:true},false);
    } else this.aircraft.setVisible(false);
    this.liveView.updatePosition(null);
  }
  private async fetchPosition(signal:AbortSignal) {
    if(!this.selected||this.selected.status!=='ENROUTE'||this.viewMode!=='LIVE')return;
    if(!this.lastPosition)this.liveView.setMessage('Waiting for live position...');
    try {
      const result=await this.provider.getPosition(this.selected.id,signal);if(signal.aborted)return;
      if(!result.data) {this.liveView.setMessage('Position not available yet.');return;}
      let next=result.data;
      if(next.heading===null) {
        const previous=this.lastPosition||this.track.filter(p=>Date.parse(p.timestamp)<Date.parse(next.timestamp)).at(-1);
        if(previous&&distanceBetween({lat:previous.latitude,lng:previous.longitude},{lat:next.latitude,lng:next.longitude})>1)
          next={...next,heading:bearingBetween({lat:previous.latitude,lng:previous.longitude},{lat:next.latitude,lng:next.longitude})};
      }
      if(this.interpolator.push(next))this.lastPosition=next;
      this.drawRemainingRoute();
      this.liveView.setMessage(result.stale?'LIVE DATA TEMPORARILY UNAVAILABLE · showing last position':Date.now()-Date.parse(result.data.timestamp)>120000?'Position is older than 2 minutes.':this.autoPositionRefresh?'Live position · 自動更新 ON（1分ごと）':'Live position · 自動更新 OFF（手動取得）');
      this.updateSource(result.stale?' · cached position':'');
      if(!this.raf)this.animateLive();this.debug();
    } catch(error) {if(!signal.aborted)this.liveView.setMessage('LIVE DATA TEMPORARILY UNAVAILABLE · '+errorText(error));}
  }
  private animateLive=()=>{
    this.raf=requestAnimationFrame(this.animateLive);
    if(performance.now()-this.lastFrame<30)return;this.lastFrame=performance.now();
    const p=this.interpolator.sample();if(p)this.applyPosition(p,true);
  };
  private applyPosition(p:SkyRoutePosition,updateHud:boolean) {
    if(p.altitudeMeters===null){this.aircraft.setVisible(false);if(updateHud)this.liveView.updatePosition(p);return;}
    const destination=this.selected?.destination;
    const remaining=destination?.latitude!=null&&destination.longitude!=null?distanceBetween({lat:p.latitude,lng:p.longitude},{lat:destination.latitude,lng:destination.longitude})/1000:0;
    this.applyTelemetry({lat:p.latitude,lng:p.longitude,altitude:p.altitudeMeters,speedKmh:p.groundSpeedKmh??0,heading:p.heading??this.currentTelemetry?.heading??0,pitch:0,roll:0,
      progress:0,distanceRemainingKm:remaining,totalDistanceKm:remaining,isClimbing:false,isDescent:false,flightPhase:'Cruise'});
    if(updateHud)this.liveView.updatePosition(p);
  }
  private scheduleSelection() {
    clearTimeout(this.selectionTimer);
    if(this.autoPositionRefresh&&this.selected&&!['ARRIVED','CANCELLED'].includes(this.selected.status)&&this.viewMode==='LIVE')
      this.selectionTimer=window.setTimeout(()=>void this.pollSelection(),60000);
  }
  private async pollSelection() {
    if(!this.selected||this.viewMode!=='LIVE')return;
    const signal=this.selectionAbort.signal,id=this.selected.id;
    try {
      const detail=await this.provider.getFlight(id,signal);if(signal.aborted)return;
      this.selected={...detail.data,origin:this.selected.origin,destination:this.selected.destination};
      this.aircraft.setModel(aircraftModelUrlForFlight(this.selected));
      if(this.selected.status!=='ENROUTE') {cancelAnimationFrame(this.raf);this.raf=0;this.interpolator.reset();this.lastPosition=null;}
      {this.liveView.showFlight(this.selected,this.provider.source==='mock'?'MOCK':'LIVE');this.bindFlightActions();this.rebuildRoutes();this.placeStationary();}
      if(this.selected.status!=='ENROUTE')this.liveView.setMessage(this.selected.status==='CANCELLED'?'Cancelled':this.selected.status==='ARRIVED'?'Arrived':'Scheduled / Position not available yet.');
      if(this.selected.status==='ENROUTE') {
        await this.fetchPosition(signal);if(signal.aborted)return;
        if(Date.now()-this.lastTrackFetch>=180000) {
          const result=await this.provider.getTrack(id,signal);if(signal.aborted)return;
          this.track=result.data;this.lastTrackFetch=Date.now();this.rebuildRoutes();
        }
      } else if(this.selected.status==='ARRIVED') {
        cancelAnimationFrame(this.raf);this.raf=0;const result=await this.provider.getTrack(id,signal);if(signal.aborted)return;
        this.track=result.data;this.rebuildRoutes();this.placeStationary();this.liveView.setMessage('Arrived');
      }
    } catch(error) {if(!signal.aborted)this.liveView.setMessage('LIVE DATA TEMPORARILY UNAVAILABLE · '+errorText(error));}
    finally {if(!signal.aborted)this.scheduleSelection();}
  }
  private startPreview(replay:boolean) {
    if(!this.selected||this.selected.status==='CANCELLED'||!this.route)return;
    let route=replay?chooseRoute(this.selected,null,this.track):this.route;
    if(!replay&&this.selected.status==='ENROUTE'&&this.lastPosition&&this.selected.destination.latitude!==null&&this.selected.destination.longitude!==null) {
      const origin={...this.selected.origin,latitude:this.lastPosition.latitude,longitude:this.lastPosition.longitude,altitudeMeters:this.lastPosition.altitudeMeters};
      const waypoints=greatCirclePoints(origin,this.selected.destination);
      route={type:'ESTIMATED',waypoints,altitudeEstimated:waypoints.some(p=>p.altitudeEstimated)};
    }
    if(route.waypoints.length<2)return;
    this.selectionAbort.abort();this.selectionAbort=new AbortController();clearTimeout(this.selectionTimer);cancelAnimationFrame(this.raf);this.raf=0;
    this.viewMode=replay?'REPLAY':'PREVIEW';this.updateSource();element('live-view-mode').textContent=this.viewMode;
    this.liveView.setMessage(replay?'Recorded track replay · not the current position':'Simulated flight · not the current position');
    this.planned.setRoute(route.type==='ACTUAL'?[]:route.waypoints.map(p=>({lat:p.latitude,lng:p.longitude,altitude:p.altitudeMeters})),route.type);
    this.enablePlayback(true);const animationRoute=toAnimationRoute(this.selected,route);this.camera.setRoute(animationRoute);
    this.animator.setRoute(animationRoute);this.animator.play();this.syncPlayback();
  }
  private async returnLive() {
    if(!this.selected)return;
    this.selectionAbort.abort();this.selectionAbort=new AbortController();clearTimeout(this.selectionTimer);cancelAnimationFrame(this.raf);this.raf=0;
    this.animator.pause();this.syncPlayback();this.viewMode='LIVE';this.enablePlayback(false);this.interpolator.reset();this.lastPosition=null;this.aircraft.setVisible(false);
    this.updateSource();element('live-view-mode').textContent=this.provider.source==='mock'?'MOCK':'LIVE';
    this.placeStationary();await this.pollSelection();
  }
  private debug() {this.liveView.debug({source:this.provider.source,flightId:this.selected?.id,routeType:this.route?.type,trackPoints:this.track.length,
    positionAgeSeconds:this.lastPosition?Math.round((Date.now()-Date.parse(this.lastPosition.timestamp))/1000):null,
    altitudeSource:this.lastPosition?.altitudeEstimated?'estimated':this.lastPosition?.altitudeMeters!=null?'reported':'unavailable',lastPositionUpdate:this.lastPosition?.timestamp});}
}
