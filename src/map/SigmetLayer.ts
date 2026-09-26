import type { Maps3DLibrary } from './initMap3D';
import type { Waypoint } from '../flight/types';

type LngLat=[number,number];

interface SigmetProperties {
  icaoId:string;
  firId:string;
  firName:string;
  seriesId:string;
  hazard:string;
  qualifier:string;
  validTimeFrom:string|null;
  validTimeTo:string|null;
  altitudeLowFeet:number|null;
  altitudeHighFeet:number|null;
  movementDir:number|null;
  movementSpd:number|null;
  rawText:string;
}

interface SigmetFeature {
  type:'Feature';
  id:string;
  properties:SigmetProperties;
  geometry:
    | {type:'Polygon';coordinates:LngLat[][]}
    | {type:'MultiPolygon';coordinates:LngLat[][][]};
}

interface SigmetCollection {
  type:'FeatureCollection';
  features:SigmetFeature[];
  fetchedAt?:string;
  source?:string;
  stale?:boolean;
  warning?:string;
}

export interface SigmetLayerStatus {
  enabled:boolean;
  count:number;
  message:string;
  stale:boolean;
}

const CORRIDOR_KM=250;
const EARTH_KM=6371;
const toRad=(value:number)=>value*Math.PI/180;

const hazardStyle=(hazard:string)=>{
  const value=hazard.toUpperCase();
  if(value.includes('TURB'))return {fill:'rgba(255,145,0,.24)',stroke:'rgba(255,170,40,.92)'};
  if(value.includes('ICE'))return {fill:'rgba(75,120,255,.24)',stroke:'rgba(115,155,255,.95)'};
  if(value.includes('VA')||value.includes('ASH'))return {fill:'rgba(145,120,170,.25)',stroke:'rgba(190,160,220,.95)'};
  if(value.includes('TC')||value.includes('CYCL'))return {fill:'rgba(255,55,165,.24)',stroke:'rgba(255,105,190,.95)'};
  if(value.includes('MTW')||value.includes('MOUNTAIN'))return {fill:'rgba(190,145,60,.24)',stroke:'rgba(225,180,85,.95)'};
  return {fill:'rgba(255,55,55,.24)',stroke:'rgba(255,95,95,.95)'};
};

const outerRings=(feature:SigmetFeature):LngLat[][]=>
  feature.geometry.type==='Polygon'
    ?feature.geometry.coordinates.slice(0,1)
    :feature.geometry.coordinates.map(polygon=>polygon[0]).filter(Boolean);

const featurePolygons=(feature:SigmetFeature):LngLat[][][]=>
  feature.geometry.type==='Polygon'
    ?[feature.geometry.coordinates]
    :feature.geometry.coordinates;

const pointInRing=(point:{lat:number;lng:number},ring:LngLat[]):boolean=>{
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i];
    const [xj,yj]=ring[j];
    const intersects=((yi>point.lat)!==(yj>point.lat))
      &&point.lng<(xj-xi)*(point.lat-yi)/((yj-yi)||1e-12)+xi;
    if(intersects)inside=!inside;
  }
  return inside;
};

const pointToSegmentKm=(point:{lat:number;lng:number},a:{lat:number;lng:number},b:{lat:number;lng:number}):number=>{
  const refLat=toRad((point.lat+a.lat+b.lat)/3);
  const scaleX=Math.cos(refLat);
  const px=toRad(point.lng)*scaleX*EARTH_KM;
  const py=toRad(point.lat)*EARTH_KM;
  const ax=toRad(a.lng)*scaleX*EARTH_KM;
  const ay=toRad(a.lat)*EARTH_KM;
  const bx=toRad(b.lng)*scaleX*EARTH_KM;
  const by=toRad(b.lat)*EARTH_KM;
  const dx=bx-ax,dy=by-ay;
  const lengthSq=dx*dx+dy*dy;
  const t=lengthSq===0?0:Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/lengthSq));
  return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
};

const routeBounds=(route:Waypoint[])=>{
  const lats=route.map(point=>point.lat);
  const lngs=route.map(point=>point.lng);
  return {
    minLat:Math.min(...lats),
    maxLat:Math.max(...lats),
    minLng:Math.min(...lngs),
    maxLng:Math.max(...lngs),
  };
};

const featureBounds=(rings:LngLat[][])=>{
  const coords=rings.flat();
  return {
    minLat:Math.min(...coords.map(([,lat])=>lat)),
    maxLat:Math.max(...coords.map(([,lat])=>lat)),
    minLng:Math.min(...coords.map(([lng])=>lng)),
    maxLng:Math.max(...coords.map(([lng])=>lng)),
  };
};

const featureNearRoute=(feature:SigmetFeature,route:Waypoint[],corridorKm=CORRIDOR_KM):boolean=>{
  if(route.length<2)return false;
  const rings=outerRings(feature).filter(ring=>ring.length>=4);
  if(!rings.length)return false;

  const rb=routeBounds(route);
  const fb=featureBounds(rings);
  const midLat=(rb.minLat+rb.maxLat)/2;
  const latPad=corridorKm/111;
  const lngPad=corridorKm/(111*Math.max(.25,Math.cos(toRad(midLat))));
  if(
    fb.maxLat<rb.minLat-latPad||fb.minLat>rb.maxLat+latPad||
    fb.maxLng<rb.minLng-lngPad||fb.minLng>rb.maxLng+lngPad
  )return false;

  for(const routePoint of route){
    if(rings.some(ring=>pointInRing(routePoint,ring)))return true;
  }

  for(const ring of rings){
    for(const [lng,lat] of ring){
      const point={lat,lng};
      for(let i=0;i<route.length-1;i++){
        if(pointToSegmentKm(point,route[i],route[i+1])<=corridorKm)return true;
      }
    }
  }
  return false;
};

export class SigmetLayer {
  private enabled=false;
  private route:Waypoint[]=[];
  private data:SigmetCollection|null=null;
  private polygons:HTMLElement[]=[];
  private status:SigmetLayerStatus={enabled:false,count:0,message:'SIGMET OFF',stale:false};

  constructor(
    private lib:Maps3DLibrary,
    private map:HTMLElement,
    private onStatus?:(status:SigmetLayerStatus)=>void,
  ){}

  public setRoute(waypoints:Waypoint[]):void{
    this.route=[...waypoints];
    if(this.enabled&&this.data)this.render();
  }

  public clearRoute():void{
    this.route=[];
    this.clearPolygons();
    this.updateStatus(0,this.enabled?'SIGMET · 航路を選択してください':'SIGMET OFF',false);
  }

  public async setEnabled(enabled:boolean):Promise<SigmetLayerStatus>{
    this.enabled=enabled;
    if(!enabled){
      this.clearPolygons();
      this.updateStatus(0,'SIGMET OFF',false);
      return this.status;
    }
    if(this.route.length<2){
      this.updateStatus(0,'SIGMET · 航路を選択してください',false);
      return this.status;
    }

    this.updateStatus(0,'SIGMET 読込中…',false);
    try{
      const response=await fetch('/api/weather/sigmet',{headers:{Accept:'application/json'}});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'SIGMET_UNAVAILABLE');
      this.data=body as SigmetCollection;
      this.render();
      return this.status;
    }catch{
      this.clearPolygons();
      this.updateStatus(0,'SIGMET 取得失敗',false);
      return this.status;
    }
  }

  public getStatus():SigmetLayerStatus{return this.status;}

  private render():void{
    this.clearPolygons();
    if(!this.enabled||!this.data||this.route.length<2)return;

    const nearby=this.data.features.filter(feature=>featureNearRoute(feature,this.route));
    for(const feature of nearby){
      const style=hazardStyle(feature.properties.hazard);
      for(const polygon of featurePolygons(feature)){
        const [outer,...holes]=polygon;
        if(!outer||outer.length<4)continue;
        const element=new this.lib.Polygon3DInteractiveElement({
          path:outer.map(([lng,lat])=>({lat,lng,altitude:120})),
          innerPaths:holes.map(ring=>ring.map(([lng,lat])=>({lat,lng,altitude:120}))),
          altitudeMode:this.lib.AltitudeMode.RELATIVE_TO_GROUND,
          fillColor:style.fill,
          strokeColor:style.stroke,
          strokeWidth:2,
          drawsOccludedSegments:true,
          geodesic:true,
          zIndex:12,
        });
        element.setAttribute('title',this.featureTitle(feature));
        element.addEventListener('gmp-click',()=>{
          this.map.dispatchEvent(new CustomEvent('skyroute-sigmet-click',{
            detail:{...feature.properties,id:feature.id},
            bubbles:true,
          }));
        });
        this.map.appendChild(element);
        this.polygons.push(element);
      }
    }

    const stale=Boolean(this.data.stale);
    this.updateStatus(
      nearby.length,
      nearby.length
        ?`SIGMET ON · 航路周辺 ${nearby.length}件${stale?' · cached':''}`
        :`SIGMET ON · 航路周辺なし${stale?' · cached':''}`,
      stale,
    );
  }

  private featureTitle(feature:SigmetFeature):string{
    const p=feature.properties;
    const area=p.firName||p.firId||p.icaoId||'';
    return [p.hazard||'SIGMET',area,p.seriesId].filter(Boolean).join(' · ');
  }

  private clearPolygons():void{
    for(const polygon of this.polygons)polygon.remove();
    this.polygons=[];
  }

  private updateStatus(count:number,message:string,stale:boolean):void{
    this.status={enabled:this.enabled,count,message,stale};
    this.onStatus?.(this.status);
  }

  public destroy():void{
    this.enabled=false;
    this.clearPolygons();
    this.route=[];
    this.data=null;
  }
}
