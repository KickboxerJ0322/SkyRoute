import type { Maps3DLibrary } from './initMap3D';

export type Nowcast3DTimeMode='current'|'forecast60';
export type Nowcast3DLayerKind='rain'|'thunder'|'tornado';

export interface Nowcast3DAirport {
  code:string;
  name:string;
  lat:number;
  lng:number;
}

interface RainCell {
  lat:number;
  lng:number;
  sizeKm:number;
  minMmPerHour:number;
  maxMmPerHour:number|null;
  label:string;
}

interface ThreatCell {
  lat:number;
  lng:number;
  sizeKm:number;
  level:number;
  label:string;
}

interface RainFrame {
  basetime:string;
  validtime:string;
  radiusKm:number;
  stepKm:number;
  cells:RainCell[];
}

interface ThreatFrame {
  basetime:string|null;
  validtime:string|null;
  radiusKm:number;
  stepKm:number;
  cells:ThreatCell[];
}

interface WeatherAreaResponse {
  lat:number;
  lng:number;
  current:RainFrame;
  forecast60:RainFrame;
  thunder:{current:ThreatFrame;forecast60:ThreatFrame};
  tornado:{current:ThreatFrame;forecast60:ThreatFrame};
  fetchedAt:string;
  source:string;
  note:string;
}

interface LoadedArea {
  airport:Nowcast3DAirport;
  data:WeatherAreaResponse;
}

const heightForRain=(min:number):number=>{
  if(min>=80)return 6000;
  if(min>=50)return 4800;
  if(min>=30)return 3600;
  if(min>=20)return 2700;
  if(min>=10)return 1900;
  if(min>=5)return 1200;
  return 650;
};

const styleForRain=(min:number):{fill:string;stroke:string}=>{
  if(min>=80)return {fill:'#B4006899',stroke:'#F7A9D1'};
  if(min>=50)return {fill:'#FF280099',stroke:'#FF8B73'};
  if(min>=30)return {fill:'#FF990092',stroke:'#FFD08A'};
  if(min>=20)return {fill:'#FAF5008F',stroke:'#FFF98B'};
  if(min>=10)return {fill:'#0041FF86',stroke:'#7EA0FF'};
  if(min>=5)return {fill:'#218CFF78',stroke:'#76BCFF'};
  return {fill:'#A0D2FF6E',stroke:'#D1E9FF'};
};

const heightForThunder=(level:number):number=>{
  if(level>=4)return 7600;
  if(level===3)return 6000;
  if(level===2)return 4400;
  return 3000;
};

const styleForThunder=(level:number):{fill:string;stroke:string}=>{
  if(level>=4)return {fill:'#FF6A00CC',stroke:'#FFE08A'};
  if(level===3)return {fill:'#FF9800C4',stroke:'#FFE0A3'};
  if(level===2)return {fill:'#FFC400B8',stroke:'#FFF0A8'};
  return {fill:'#FFF04AA6',stroke:'#FFF9B6'};
};

const heightForTornado=(level:number):number=>level>=2?8200:5400;

const styleForTornado=(level:number):{fill:string;stroke:string}=>level>=2
  ?{fill:'#D0007FD1',stroke:'#FF9DD1'}
  :{fill:'#9C27BEBB',stroke:'#E1A8F1'};

const frameLabel=(mode:Nowcast3DTimeMode)=>mode==='current'?'現在':'約60分後';

export class Nowcast3DLayer {
  private enabled=true;
  private timeMode:Nowcast3DTimeMode='current';
  private airports:Nowcast3DAirport[]=[];
  private loadedAreas:LoadedArea[]=[];
  private polygons:HTMLElement[]=[];
  private requestId=0;
  private layerEnabled:Record<Nowcast3DLayerKind,boolean>={
    rain:true,
    thunder:true,
    tornado:true,
  };

  constructor(
    private lib:Maps3DLibrary,
    private map:HTMLElement,
  ){}

  public setEnabled(enabled:boolean):void{
    this.enabled=enabled;
    if(!enabled){
      this.clearPolygons();
      return;
    }
    if(this.loadedAreas.length)this.render();
    else void this.refreshData();
  }

  public setLayerEnabled(kind:Nowcast3DLayerKind,enabled:boolean):void{
    this.layerEnabled[kind]=enabled;
    if(this.enabled)this.render();
  }

  public setTimeMode(mode:Nowcast3DTimeMode):void{
    if(this.timeMode===mode)return;
    this.timeMode=mode;
    if(this.enabled)this.render();
  }

  public setAirports(origin:Nowcast3DAirport|null,destination:Nowcast3DAirport|null):void{
    this.airports=[origin,destination].filter((value):value is Nowcast3DAirport=>Boolean(value));
    this.loadedAreas=[];
    if(this.enabled)void this.refreshData();
    else this.clearPolygons();
  }

  public clear():void{
    this.airports=[];
    this.loadedAreas=[];
    this.requestId++;
    this.clearPolygons();
  }

  private async refreshData():Promise<void>{
    const id=++this.requestId;
    this.clearPolygons();
    if(!this.enabled||!this.airports.length)return;

    const unique=this.airports.filter((airport,index,list)=>
      list.findIndex(other=>Math.abs(other.lat-airport.lat)<1e-5&&Math.abs(other.lng-airport.lng)<1e-5)===index
    );

    const results=await Promise.allSettled(unique.map(async airport=>{
      const params=new URLSearchParams({
        lat:String(airport.lat),
        lng:String(airport.lng),
        radius:'30',
      });
      const response=await fetch(`/api/weather/nowcast/area?${params}`,{headers:{Accept:'application/json'}});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'NOWCAST_3D_UNAVAILABLE');
      return {airport,data:body as WeatherAreaResponse};
    }));

    if(id!==this.requestId||!this.enabled)return;
    this.loadedAreas=results
      .filter((result):result is PromiseFulfilledResult<LoadedArea>=>result.status==='fulfilled')
      .map(result=>result.value);
    this.render();
  }

  private render():void{
    this.clearPolygons();
    if(!this.enabled)return;

    for(const {airport,data} of this.loadedAreas){
      if(this.layerEnabled.rain){
        const rainFrame=data[this.timeMode];
        for(const cell of rainFrame.cells)this.renderRainCell(airport,cell);
      }
      if(this.layerEnabled.thunder){
        const thunderFrame=data.thunder[this.timeMode];
        for(const cell of thunderFrame.cells)this.renderThunderCell(airport,cell);
      }
      if(this.layerEnabled.tornado){
        const tornadoFrame=data.tornado[this.timeMode];
        for(const cell of tornadoFrame.cells)this.renderTornadoCell(airport,cell);
      }
    }
  }

  private renderRainCell(airport:Nowcast3DAirport,cell:RainCell):void{
    const height=heightForRain(cell.minMmPerHour);
    const style=styleForRain(cell.minMmPerHour);
    const range=cell.maxMmPerHour==null
      ?`${cell.minMmPerHour} mm/h以上`
      :`${cell.minMmPerHour}–${cell.maxMmPerHour} mm/h`;
    this.renderBox(
      cell.lat,cell.lng,cell.sizeKm,height,style.fill,style.stroke,9,
      `${airport.code} ${frameLabel(this.timeMode)} · 雨 ${cell.label} ${range} · 高さは降水強度の視覚表現`,
    );
  }

  private renderThunderCell(airport:Nowcast3DAirport,cell:ThreatCell):void{
    const height=heightForThunder(cell.level);
    const style=styleForThunder(cell.level);
    this.renderBox(
      cell.lat,cell.lng,Math.max(1.2,cell.sizeKm*.42),height,style.fill,style.stroke,10,
      `${airport.code} ${frameLabel(this.timeMode)} · 雷 ${cell.label} · 高さは雷活動度の視覚表現`,
    );
  }

  private renderTornadoCell(airport:Nowcast3DAirport,cell:ThreatCell):void{
    const height=heightForTornado(cell.level);
    const style=styleForTornado(cell.level);
    this.renderDiamond(
      cell.lat,cell.lng,Math.max(1.8,cell.sizeKm*.28),height,style.fill,style.stroke,11,
      `${airport.code} ${frameLabel(this.timeMode)} · ${cell.label} · 竜巻等の激しい突風の発生確度（実発生を意味しません）`,
    );
  }

  private renderBox(
    lat:number,lng:number,sizeKm:number,height:number,
    fill:string,stroke:string,zIndex:number,title:string,
  ):void{
    const halfKm=sizeKm/2;
    const halfLat=halfKm/111;
    const halfLng=halfKm/(111*Math.max(.25,Math.cos(lat*Math.PI/180)));
    this.appendExtrudedPolygon([
      {lat:lat-halfLat,lng:lng-halfLng,altitude:height},
      {lat:lat-halfLat,lng:lng+halfLng,altitude:height},
      {lat:lat+halfLat,lng:lng+halfLng,altitude:height},
      {lat:lat+halfLat,lng:lng-halfLng,altitude:height},
      {lat:lat-halfLat,lng:lng-halfLng,altitude:height},
    ],fill,stroke,zIndex,title);
  }

  private renderDiamond(
    lat:number,lng:number,sizeKm:number,height:number,
    fill:string,stroke:string,zIndex:number,title:string,
  ):void{
    const radiusLat=sizeKm/111;
    const radiusLng=sizeKm/(111*Math.max(.25,Math.cos(lat*Math.PI/180)));
    this.appendExtrudedPolygon([
      {lat:lat+radiusLat,lng,altitude:height},
      {lat,lng:lng+radiusLng,altitude:height},
      {lat:lat-radiusLat,lng,altitude:height},
      {lat,lng:lng-radiusLng,altitude:height},
      {lat:lat+radiusLat,lng,altitude:height},
    ],fill,stroke,zIndex,title);
  }

  private appendExtrudedPolygon(
    path:Array<{lat:number;lng:number;altitude:number}>,
    fill:string,stroke:string,zIndex:number,title:string,
  ):void{
    const polygon=new this.lib.Polygon3DInteractiveElement({
      altitudeMode:this.lib.AltitudeMode.RELATIVE_TO_GROUND,
      fillColor:fill,
      strokeColor:stroke,
      strokeWidth:1.6,
      extruded:true,
      drawsOccludedSegments:true,
      geodesic:false,
      zIndex,
    }) as HTMLElement & {
      path:Array<{lat:number;lng:number;altitude?:number}>;
      extruded?:boolean;
    };
    polygon.path=path;
    polygon.extruded=true;
    polygon.setAttribute(
      'title',
      `${title}（実際の雲・雷・竜巻の高さではありません）`,
    );
    this.map.appendChild(polygon);
    this.polygons.push(polygon);
  }

  private clearPolygons():void{
    for(const polygon of this.polygons)polygon.remove();
    this.polygons=[];
  }

  public destroy():void{
    this.enabled=false;
    this.requestId++;
    this.airports=[];
    this.loadedAreas=[];
    this.clearPolygons();
  }
}
