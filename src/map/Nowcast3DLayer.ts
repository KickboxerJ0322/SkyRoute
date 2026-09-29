import type { Maps3DLibrary } from './initMap3D';

export type Nowcast3DTimeMode='current'|'forecast60';

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

interface RainFrame {
  basetime:string;
  validtime:string;
  radiusKm:number;
  stepKm:number;
  cells:RainCell[];
}

interface RainAreaResponse {
  lat:number;
  lng:number;
  current:RainFrame;
  forecast60:RainFrame;
  fetchedAt:string;
  source:string;
  note:string;
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

const frameLabel=(mode:Nowcast3DTimeMode)=>mode==='current'?'現在':'約60分後';

export class Nowcast3DLayer {
  private enabled=true;
  private timeMode:Nowcast3DTimeMode='current';
  private airports:Nowcast3DAirport[]=[];
  private polygons:HTMLElement[]=[];
  private requestId=0;

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
    void this.refresh();
  }

  public setTimeMode(mode:Nowcast3DTimeMode):void{
    if(this.timeMode===mode)return;
    this.timeMode=mode;
    if(this.enabled)void this.refresh();
  }

  public setAirports(origin:Nowcast3DAirport|null,destination:Nowcast3DAirport|null):void{
    this.airports=[origin,destination].filter((value):value is Nowcast3DAirport=>Boolean(value));
    if(this.enabled)void this.refresh();
    else this.clearPolygons();
  }

  public clear():void{
    this.airports=[];
    this.requestId++;
    this.clearPolygons();
  }

  private async refresh():Promise<void>{
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
      return {airport,data:body as RainAreaResponse};
    }));

    if(id!==this.requestId||!this.enabled)return;
    for(const result of results){
      if(result.status!=='fulfilled')continue;
      const {airport,data}=result.value;
      const frame=data[this.timeMode];
      for(const cell of frame.cells)this.renderCell(airport,cell,frame);
    }
  }

  private renderCell(airport:Nowcast3DAirport,cell:RainCell,frame:RainFrame):void{
    const halfKm=cell.sizeKm/2;
    const halfLat=halfKm/111;
    const cosLat=Math.max(.25,Math.cos(cell.lat*Math.PI/180));
    const halfLng=halfKm/(111*cosLat);
    const height=heightForRain(cell.minMmPerHour);
    const style=styleForRain(cell.minMmPerHour);

    const polygon=new this.lib.Polygon3DInteractiveElement({
      altitudeMode:this.lib.AltitudeMode.RELATIVE_TO_GROUND,
      fillColor:style.fill,
      strokeColor:style.stroke,
      strokeWidth:1.5,
      extruded:true,
      drawsOccludedSegments:true,
      geodesic:false,
      zIndex:9,
    }) as HTMLElement & {
      path:Array<{lat:number;lng:number;altitude?:number}>;
      extruded?:boolean;
    };

    polygon.path=[
      {lat:cell.lat-halfLat,lng:cell.lng-halfLng,altitude:height},
      {lat:cell.lat-halfLat,lng:cell.lng+halfLng,altitude:height},
      {lat:cell.lat+halfLat,lng:cell.lng+halfLng,altitude:height},
      {lat:cell.lat+halfLat,lng:cell.lng-halfLng,altitude:height},
      {lat:cell.lat-halfLat,lng:cell.lng-halfLng,altitude:height},
    ];
    polygon.extruded=true;
    const range=cell.maxMmPerHour==null
      ?`${cell.minMmPerHour} mm/h以上`
      :`${cell.minMmPerHour}–${cell.maxMmPerHour} mm/h`;
    polygon.setAttribute(
      'title',
      `${airport.code} ${frameLabel(this.timeMode)} · ${cell.label} ${range} · 3D高さは降水強度の視覚表現（雲頂高度ではありません）`,
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
    this.clearPolygons();
  }
}
