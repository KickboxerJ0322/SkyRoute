export interface NowcastAirport {
  code:string;
  name:string;
  lat:number;
  lng:number;
}

interface NowcastTime {
  basetime:string;
  validtime:string;
}

interface NowcastTimes {
  current:NowcastTime;
  forecast60:NowcastTime;
  source:string;
  tileTemplate:string;
}

export interface NowcastIntensity {
  status:string;
  minMmPerHour:number|null;
  maxMmPerHour:number|null;
  label:string;
  zoom:number|null;
}

export interface NowcastFrameAnalysis {
  basetime:string;
  validtime:string;
  radiusKm:number;
  center:NowcastIntensity;
  nearbyMax:NowcastIntensity;
  availableSamples:number;
  totalSamples:number;
}

export interface NowcastThreatValue {
  status:string;
  level:number|null;
  label:string;
  zoom:number|null;
}
export interface NowcastThreatFrame {
  basetime:string|null;
  validtime:string|null;
  radiusKm:number;
  center:NowcastThreatValue;
  nearbyMax:NowcastThreatValue;
  availableSamples:number;
  totalSamples:number;
}
export interface NowcastPointAnalysis {
  lat:number;
  lng:number;
  current:NowcastFrameAnalysis;
  forecast60:NowcastFrameAnalysis;
  thunder:{current:NowcastThreatFrame;forecast60:NowcastThreatFrame};
  tornado:{current:NowcastThreatFrame;forecast60:NowcastThreatFrame};
  fetchedAt:string;
  source:string;
}

export interface NowcastCommentaryContext {
  origin:{airport:NowcastAirport;analysis:NowcastPointAnalysis}|null;
  destination:{airport:NowcastAirport;analysis:NowcastPointAnalysis}|null;
}

const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[ch]!));

const utcMs=(value:string)=>{
  if(!/^\d{14}$/.test(value))return NaN;
  return Date.UTC(
    Number(value.slice(0,4)),Number(value.slice(4,6))-1,Number(value.slice(6,8)),
    Number(value.slice(8,10)),Number(value.slice(10,12)),Number(value.slice(12,14)),
  );
};

const formatJst=(value:string)=>{
  const ms=utcMs(value);
  if(!Number.isFinite(ms))return '--';
  return new Intl.DateTimeFormat('ja-JP',{
    timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false,
  }).format(new Date(ms));
};

const intensityText=(value:NowcastIntensity)=>{
  if(value.status!=='available')return value.label||'判定不能';
  if(value.minMmPerHour===0)return '降水域なし';
  if(value.minMmPerHour==null)return value.label||'判定不能';
  const range=value.maxMmPerHour==null
    ?`${value.minMmPerHour} mm/h以上`
    :`${value.minMmPerHour}–${value.maxMmPerHour} mm/h`;
  return `${value.label} · ${range}`;
};

const tileFloat=(lat:number,lng:number,z:number)=>{
  const n=2**z;
  const clippedLat=Math.max(-85.05112878,Math.min(85.05112878,lat));
  const rad=clippedLat*Math.PI/180;
  return {
    x:(lng+180)/360*n,
    y:(1-Math.log(Math.tan(rad)+1/Math.cos(rad))/Math.PI)/2*n,
  };
};

const radarFrame=(airport:NowcastAirport,time:NowcastTime,label:string,template:string)=>{
  const z=8,width=160,height=108,tileSize=256,n=2**z;
  const center=tileFloat(airport.lat,airport.lng,z);
  const worldX=center.x*tileSize,worldY=center.y*tileSize;
  const left=worldX-width/2,top=worldY-height/2;
  const minX=Math.floor(left/tileSize),maxX=Math.floor((left+width)/tileSize);
  const minY=Math.floor(top/tileSize),maxY=Math.floor((top+height)/tileSize);
  const images:string[]=[];
  for(let ty=minY;ty<=maxY;ty++){
    if(ty<0||ty>=n)continue;
    for(let tx=minX;tx<=maxX;tx++){
      const wrapped=((tx%n)+n)%n;
      const src=template
        .replace('{basetime}',time.basetime)
        .replace('{validtime}',time.validtime)
        .replace('{z}',String(z))
        .replace('{x}',String(wrapped))
        .replace('{y}',String(ty));
      images.push(`<img src="${src}" alt="" loading="lazy" style="left:${tx*tileSize-left}px;top:${ty*tileSize-top}px">`);
    }
  }
  return `
    <div class="nowcast-frame-wrap">
      <div class="nowcast-frame-label">${esc(label)} · ${esc(formatJst(time.validtime))} JST</div>
      <div class="nowcast-radar" aria-label="${esc(airport.code)} ${esc(label)}の雨雲">
        ${images.join('')}
        <span class="nowcast-crosshair" aria-hidden="true"></span>
      </div>
    </div>`;
};

const threatText=(value:NowcastThreatValue)=>value.status==='available'
  ? value.label
  : (value.label||'判定不能');

const structuredFrame=(
  label:string,
  frame:NowcastFrameAnalysis,
  thunder:NowcastThreatFrame,
  tornado:NowcastThreatFrame,
)=>`
  <div class="nowcast-structured-row">
    <span class="nowcast-structured-time">${esc(label)} · ${esc(formatJst(frame.validtime))}</span>
    <span><b>雨・空港直上</b> ${esc(intensityText(frame.center))}</span>
    <span><b>雨・周辺${frame.radiusKm}km最大</b> ${esc(intensityText(frame.nearbyMax))}</span>
    <span><b>雷・空港直上</b> ${esc(threatText(thunder.center))}</span>
    <span><b>雷・周辺${thunder.radiusKm}km最大</b> ${esc(threatText(thunder.nearbyMax))}</span>
    <span><b>竜巻・空港直上</b> ${esc(threatText(tornado.center))}</span>
    <span><b>竜巻・周辺${tornado.radiusKm}km最大</b> ${esc(threatText(tornado.nearbyMax))}</span>
  </div>`;

export class NowcastPanel {
  private origin:NowcastAirport|null=null;
  private destination:NowcastAirport|null=null;
  private enabled=false;
  private panelVisible=true;
  private requestId=0;
  private structured:NowcastCommentaryContext|null=null;

  constructor(private container:HTMLElement){
    this.container.hidden=true;
  }

  public setAirports(origin:NowcastAirport|null,destination:NowcastAirport|null):void{
    this.origin=origin;
    this.destination=destination;
    this.structured=null;
    this.syncVisibility();
    if(this.enabled)void this.refresh();
  }

  public setPanelVisible(visible:boolean):void{
    this.panelVisible=visible;
    this.syncVisibility();
    if(visible&&this.enabled&&this.origin&&this.destination&&!this.container.childElementCount){
      void this.refresh();
    }
  }

  private syncVisibility():void{
    this.container.hidden=!this.enabled||!this.panelVisible||!this.origin||!this.destination;
  }

  public clear():void{
    this.origin=null;
    this.destination=null;
    this.structured=null;
    this.container.replaceChildren();
    this.syncVisibility();
  }

  public async setEnabled(enabled:boolean):Promise<void>{
    this.enabled=enabled;
    this.syncVisibility();
    if(!enabled)return;
    await this.refresh();
    this.syncVisibility();
  }

  public async getCommentaryContext():Promise<NowcastCommentaryContext>{
    if(this.structured)return this.structured;
    this.structured=await this.fetchStructured();
    return this.structured;
  }

  private async fetchPoint(airport:NowcastAirport):Promise<NowcastPointAnalysis>{
    const params=new URLSearchParams({lat:String(airport.lat),lng:String(airport.lng)});
    const response=await fetch(`/api/weather/nowcast/point?${params}`,{headers:{Accept:'application/json'}});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'NOWCAST_ANALYSIS_UNAVAILABLE');
    return data as NowcastPointAnalysis;
  }

  private async fetchStructured():Promise<NowcastCommentaryContext>{
    const [origin,destination]=await Promise.all([
      this.origin?this.fetchPoint(this.origin):Promise.resolve(null),
      this.destination?this.fetchPoint(this.destination):Promise.resolve(null),
    ]);
    return {
      origin:this.origin&&origin?{airport:this.origin,analysis:origin}:null,
      destination:this.destination&&destination?{airport:this.destination,analysis:destination}:null,
    };
  }

  private async refresh():Promise<void>{
    const id=++this.requestId;
    if(!this.origin||!this.destination){
      this.container.innerHTML='<div class="nowcast-panel-message">出発・到着空港を選択してください。</div>';
      return;
    }
    this.container.innerHTML='<div class="nowcast-panel-message">気象庁ナウキャスト読込中…</div>';
    try{
      const [times,structured]=await Promise.all([
        fetch('/api/weather/nowcast/times',{headers:{Accept:'application/json'}}).then(async response=>{
          const data=await response.json();
          if(!response.ok)throw new Error(data.error||'NOWCAST_UNAVAILABLE');
          return data as NowcastTimes;
        }),
        this.fetchStructured(),
      ]);
      if(id!==this.requestId)return;
      this.structured=structured;
      this.render(times,structured);
    }catch(error){
      if(id!==this.requestId)return;
      console.error('NOWCAST_FETCH_FAILED',error);
      this.container.innerHTML='<div class="nowcast-panel-message">ナウキャスト取得失敗</div>';
    }
  }

  private render(data:NowcastTimes,structured:NowcastCommentaryContext):void{
    const airports=[
      {airport:this.origin,context:structured.origin},
      {airport:this.destination,context:structured.destination},
    ].filter((value):value is {airport:NowcastAirport;context:{airport:NowcastAirport;analysis:NowcastPointAnalysis}}=>
      Boolean(value.airport&&value.context)
    );
    this.container.innerHTML=`
      <div class="nowcast-panel-head">
        <div><strong>JMA NOWCAST</strong><span> 出発・到着空港</span></div>
      </div>
      <div class="nowcast-airports">
        ${airports.map(({airport,context})=>`
          <section class="nowcast-airport-card">
            <div class="nowcast-airport-title">${esc(airport.code)} · ${esc(airport.name)}</div>
            <div class="nowcast-structured">
              ${structuredFrame('現在',context.analysis.current,context.analysis.thunder.current,context.analysis.tornado.current)}
              ${structuredFrame('約60分後',context.analysis.forecast60,context.analysis.thunder.forecast60,context.analysis.tornado.forecast60)}
            </div>
            <div class="nowcast-frame-row">
              ${radarFrame(airport,data.current,'現在',data.tileTemplate)}
              ${radarFrame(airport,data.forecast60,'約60分後',data.tileTemplate)}
            </div>
          </section>
        `).join('')}
      </div>
      <div class="nowcast-foot">出典: 気象庁 · 高解像度降水ナウキャスト / 雷ナウキャスト / 竜巻発生確度ナウキャスト · 空港直上/周辺10kmを構造化 · 中央十字＝空港位置</div>`;

  }
}

