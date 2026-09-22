import type { SkyRouteFlight, SkyRoutePosition, RouteType } from '../flight/liveTypes';
import { formatJst } from '../flight/AeroApiFlightProvider';
export const escapeHtml=(value:unknown)=>String(value??'--').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class LiveFlightView {
  private flights:SkyRouteFlight[]=[];
  private airport='RJTT';
  private flightStatus='ALL';
  private search='';
  private selectedId='';
  constructor(private list:HTMLElement,private info:HTMLElement,private select:(id:string)=>void,private airportChange?:(icao:string)=>void) {}
  showList(flights:SkyRouteFlight[],selectedId:string,message='') {
    this.flights=flights;this.selectedId=selectedId;
    this.list.innerHTML=`<div class="flight-panel live-panel">
      <div class="live-filters live-filters-primary"><select aria-label="Airport filter"><option value="RJTT">羽田</option><option value="RJAA">成田</option><option value="RJBB">関西</option><option value="RJOO">伊丹</option><option value="RJCC">新千歳</option><option value="RJFF">福岡</option><option value="ROAH">那覇</option></select><input type="search" aria-label="Destination search" placeholder="目的地を検索"><select aria-label="Flight status filter"><option value="ALL">すべての便</option><option value="ENROUTE">飛行中</option><option value="UPCOMING">出発予定</option></select></div>
      <div class="live-list-message">${escapeHtml(message)}</div><div class="routes-list live-routes"></div>
      <div class="demo-route-notice">飛行中＋今後3時間 / 各最大20便・「更新」で再取得</div></div>`;
    const airport=this.list.querySelector<HTMLSelectElement>('[aria-label="Airport filter"]')!;airport.value=this.airport;
    airport.onchange=()=>{this.airport=airport.value;this.airportChange?.(this.airport);};
    const status=this.list.querySelector<HTMLSelectElement>('[aria-label="Flight status filter"]')!;status.value=this.flightStatus;
    status.onchange=()=>{this.flightStatus=status.value;this.renderCards();};
    const search=this.list.querySelector('input')!;search.value=this.search;
    search.oninput=()=>{this.search=search.value;this.renderCards();};
    this.renderCards();
  }
  private renderCards() {
    const visible=this.flights.filter(f=>(this.flightStatus==='ALL'||(this.flightStatus==='ENROUTE'?f.status==='ENROUTE':f.status!=='ENROUTE'))&&`${f.destination.iata} ${f.destination.icao} ${f.destination.name}`.toLowerCase().includes(this.search.toLowerCase()));
    const root=this.list.querySelector('.live-routes')!;
    root.innerHTML=visible.map(f=>`<button class="route-card ${f.id===this.selectedId?'active':''}" data-flight="${escapeHtml(f.id)}"><div class="route-header-row"><span class="flight-number">${escapeHtml(f.ident)}</span><span class="route-status ${f.status==='CANCELLED'?'cancelled':''}">${escapeHtml(f.status==='ENROUTE'?'飛行中':f.status)}</span></div><div class="route-destination-row"><span class="airport-pair">${escapeHtml(f.origin.iata||f.origin.icao||'--')} → ${escapeHtml(f.destination.iata||f.destination.icao||'--')}</span></div><div class="destination-name">${escapeHtml(f.destination.name)}</div><div class="route-meta-row"><span>${escapeHtml(formatJst(f.scheduledDeparture))} JST</span><span>${escapeHtml(f.aircraftType)}</span></div></button>`).join('')||'<p class="live-empty">条件に一致する便がありません。</p>';
    root.querySelectorAll<HTMLElement>('[data-flight]').forEach(button=>button.onclick=()=>{this.selectedId=button.dataset.flight!;this.renderCards();this.select(this.selectedId);this.list.querySelector('.flight-panel')!.classList.remove('open-mobile');});
  }
  showFlight(f:SkyRouteFlight,mode:string) {
    this.info.innerHTML=`<div class="flight-info-hud live-info"><div class="hud-top-bar"><span class="hud-route-text">${escapeHtml(f.ident)} · ${escapeHtml(f.origin.iata||f.origin.icao||'--')} → ${escapeHtml(f.destination.iata||f.destination.icao||'--')}</span><span class="phase-pill" id="live-view-mode">${escapeHtml(mode)}</span></div>
      <div class="live-airports">${escapeHtml(f.origin.name)} → ${escapeHtml(f.destination.name)}</div>
      <div class="live-metadata">Operated by ${escapeHtml(f.operator)} · <span id="live-flight-status">${escapeHtml(f.status)}</span><br>Actual aircraft: ${escapeHtml(f.aircraftType)} · 3D model: SkyRoute 787-10</div>
      <div class="hud-grid"><div><div class="metric-label">ALTITUDE</div><div class="metric-value luminous" id="live-altitude">--</div></div><div><div class="metric-label">GROUND SPEED</div><div class="metric-value" id="live-speed">--</div></div><div><div class="metric-label">HEADING</div><div class="metric-value" id="live-heading">--</div></div><div><div class="metric-label">ROUTE</div><div id="live-route-type">--</div></div></div>
      <div class="live-flight-actions"><button id="live-return">LIVE</button><button id="live-refresh-position">現在位置更新</button><button id="live-preview" disabled>Preview Flight</button><button id="live-replay" disabled>Replay track</button><button id="live-ai">AI解説</button><button id="live-speak">🔊 音声</button><button id="live-stop-speak">■ 停止</button></div>
      <div class="live-ai-commentary" id="live-ai-commentary" hidden></div>
      <div class="live-ai-model-note" id="live-ai-model-note" hidden></div>
      <details class="live-time-details"><summary>Times (JST)</summary><div class="live-times">${[['Scheduled departure',f.scheduledDeparture],['Estimated departure',f.estimatedDeparture],['Actual departure',f.actualDeparture],['Scheduled arrival',f.scheduledArrival],['Estimated arrival',f.estimatedArrival],['Actual arrival',f.actualArrival]].map(([name,time])=>`<span>${name}</span><span>${escapeHtml(formatJst(time))} ${time?'JST':''}</span>`).join('')}</div></details>
      <div class="live-message" id="live-message" role="status">Loading flight route...</div><div id="live-updated" class="live-metadata">Position not available yet.</div>

      ${import.meta.env.DEV&&new URLSearchParams(location.search).get('debug')==='1'?'<pre id="live-debug"></pre>':''}</div>`;
  }
  setAirport(icao:string) {this.airport=icao;}
  setMessage(message:string) {const node=this.info.querySelector('#live-message');if(node)node.textContent=message;}
  setRoute(type:RouteType|null,actual=false) {const node=this.info.querySelector('#live-route-type');if(node)node.textContent=type?(actual&&type!=='ACTUAL'?'ACTUAL + ':'')+type:'--';}
  updatePosition(position:SkyRoutePosition|null) {
    const set=(id:string,text:string)=>{const node=this.info.querySelector('#'+id);if(node)node.textContent=text;};
    set('live-altitude',position?.altitudeMeters!=null?`${Math.round(position.altitudeMeters).toLocaleString()} m${position.altitudeEstimated?' (est.)':''}`:'--');
    set('live-speed',position?.groundSpeedKmh!=null?`${Math.round(position.groundSpeedKmh)} km/h`:'--');
    set('live-heading',position?.heading!=null?`${Math.round(position.heading)}°`:'--');
    set('live-updated',position?`Position: ${formatJst(position.timestamp,true)} JST`:'Position not available yet.');
  }
  debug(values:Record<string,unknown>) {const node=this.info.querySelector('#live-debug');if(node)node.textContent=Object.entries(values).map(([k,v])=>`${k}: ${v??'--'}`).join('\n');}
}
