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

export class NowcastPanel {
  private origin:NowcastAirport|null=null;
  private destination:NowcastAirport|null=null;
  private enabled=false;
  private requestId=0;

  constructor(private container:HTMLElement){
    this.container.hidden=true;
  }

  public setAirports(origin:NowcastAirport|null,destination:NowcastAirport|null):void{
    this.origin=origin;
    this.destination=destination;
    if(this.enabled)void this.refresh();
  }

  public clear():void{
    this.origin=null;
    this.destination=null;
    this.container.hidden=true;
    this.container.replaceChildren();
  }

  public async setEnabled(enabled:boolean):Promise<void>{
    this.enabled=enabled;
    if(!enabled){
      this.container.hidden=true;
      return;
    }
    this.container.hidden=false;
    await this.refresh();
  }

  private async refresh():Promise<void>{
    const id=++this.requestId;
    if(!this.origin||!this.destination){
      this.container.innerHTML='<div class="nowcast-panel-message">出発・到着空港を選択してください。</div>';
      return;
    }
    this.container.innerHTML='<div class="nowcast-panel-message">気象庁ナウキャスト読込中…</div>';
    try{
      const response=await fetch('/api/weather/nowcast/times',{headers:{Accept:'application/json'}});
      const data=await response.json() as NowcastTimes & {error?:string};
      if(!response.ok)throw new Error(data.error||'NOWCAST_UNAVAILABLE');
      if(id!==this.requestId)return;
      this.render(data);
    }catch(error){
      if(id!==this.requestId)return;
      console.error('NOWCAST_FETCH_FAILED',error);
      this.container.innerHTML='<div class="nowcast-panel-message">ナウキャスト取得失敗</div>';
    }
  }

  private render(data:NowcastTimes):void{
    const airports=[this.origin,this.destination].filter((value):value is NowcastAirport=>Boolean(value));
    this.container.innerHTML=`
      <div class="nowcast-panel-head">
        <div><strong>JMA NOWCAST</strong><span> 出発・到着空港</span></div>
        <button type="button" id="nowcast-panel-close" aria-label="ナウキャストを閉じる">×</button>
      </div>
      <div class="nowcast-airports">
        ${airports.map(airport=>`
          <section class="nowcast-airport-card">
            <div class="nowcast-airport-title">${esc(airport.code)} · ${esc(airport.name)}</div>
            <div class="nowcast-frame-row">
              ${radarFrame(airport,data.current,'現在',data.tileTemplate)}
              ${radarFrame(airport,data.forecast60,'約60分後',data.tileTemplate)}
            </div>
          </section>
        `).join('')}
      </div>
      <div class="nowcast-foot">気象庁 高解像度降水ナウキャスト · 中央十字＝空港位置</div>`;
    this.container.querySelector<HTMLButtonElement>('#nowcast-panel-close')?.addEventListener('click',()=>{
      this.enabled=false;
      this.container.hidden=true;
      this.container.dispatchEvent(new CustomEvent('skyroute-nowcast-close',{bubbles:true}));
    });
  }
}
