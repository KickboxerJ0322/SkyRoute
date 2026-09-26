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
    | {type:'Point';coordinates:LngLat}
    | {type:'MultiPoint';coordinates:LngLat[]}
    | {type:'Polygon';coordinates:LngLat[][]}
    | {type:'MultiPolygon';coordinates:LngLat[][][]};
}

interface SigmetCollection {
  type:'FeatureCollection';
  features:SigmetFeature[];
  fetchedAt?:string;
  source?:string;
  sourceEndpoint?:string;
  sourceFormat?:string;
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
  // Use the same 8-digit hex notation as the official Maps 3D polygon examples.
  if(value.includes('TURB'))return {fill:'#ff91003d',stroke:'#ffaa28eb'};
  if(value.includes('ICE'))return {fill:'#4b78ff3d',stroke:'#739bfff2'};
  if(value.includes('VA')||value.includes('ASH'))return {fill:'#9178aa40',stroke:'#bea0dcf2'};
  if(value.includes('TC')||value.includes('CYCL'))return {fill:'#ff37a53d',stroke:'#ff69bef2'};
  if(value.includes('MTW')||value.includes('MOUNTAIN'))return {fill:'#be913c3d',stroke:'#e1b455f2'};
  return {fill:'#ff37373d',stroke:'#ff5f5ff2'};
};

const outerRings=(feature:SigmetFeature):LngLat[][]=>{
  if(feature.geometry.type==='Polygon')return feature.geometry.coordinates.slice(0,1);
  if(feature.geometry.type==='MultiPolygon')return feature.geometry.coordinates.map(polygon=>polygon[0]).filter(Boolean);
  return [];
};

const featurePolygons=(feature:SigmetFeature):LngLat[][][]=>{
  if(feature.geometry.type==='Polygon')return [feature.geometry.coordinates];
  if(feature.geometry.type==='MultiPolygon')return feature.geometry.coordinates;
  return [];
};

const featurePoints=(feature:SigmetFeature):LngLat[]=>{
  if(feature.geometry.type==='Point')return [feature.geometry.coordinates];
  if(feature.geometry.type==='MultiPoint')return feature.geometry.coordinates;
  return [];
};

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

const pointCircleRing=(center:LngLat,radiusKm=45,steps=40):LngLat[]=>{
  const [lng,lat]=center;
  const latRad=toRad(lat);
  const latDelta=radiusKm/111;
  const lngDelta=radiusKm/(111*Math.max(.2,Math.cos(latRad)));
  const ring:Array<LngLat>=[];
  for(let i=0;i<=steps;i++){
    const angle=2*Math.PI*i/steps;
    ring.push([
      lng+Math.cos(angle)*lngDelta,
      lat+Math.sin(angle)*latDelta,
    ]);
  }
  return ring;
};

const featureNearRoute=(feature:SigmetFeature,route:Waypoint[],corridorKm=CORRIDOR_KM):boolean=>{
  if(route.length<2)return false;

  const points=featurePoints(feature);
  if(points.length){
    for(const [lng,lat] of points){
      const point={lat,lng};
      for(let i=0;i<route.length-1;i++){
        if(pointToSegmentKm(point,route[i],route[i+1])<=corridorKm)return true;
      }
    }
    return false;
  }

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
  private statusListener:((status:SigmetLayerStatus)=>void)|null=null;
  private refreshTimer=0;

  constructor(
    private lib:Maps3DLibrary,
    private map:HTMLElement,
  ){}

  public onStatusChange(listener:(status:SigmetLayerStatus)=>void):void{
    this.statusListener=listener;
    listener(this.status);
  }

  public setRoute(waypoints:Waypoint[]):void{
    this.route=[...waypoints];
    if(!this.enabled)return;
    if(this.data)this.render();
    else void this.setEnabled(true);
  }

  public clearRoute():void{
    this.route=[];
    this.clearPolygons();
    this.updateStatus(0,this.enabled?'SIGMET · 航路を選択してください':'SIGMET OFF',false);
  }

  public async setEnabled(enabled:boolean):Promise<SigmetLayerStatus>{
    this.enabled=enabled;
    if(!enabled){
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer=0;
      this.clearPolygons();
      this.updateStatus(0,'SIGMET OFF',false);
      return this.status;
    }
    if(this.route.length<2){
      this.updateStatus(0,'SIGMET · 航路を選択してください',false);
      return this.status;
    }

    this.updateStatus(0,'SIGMET 読込中…',false);

    let body:SigmetCollection;
    try{
      const response=await fetch('/api/weather/sigmet',{headers:{Accept:'application/json'}});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.error||'SIGMET_UNAVAILABLE');
      body=payload as SigmetCollection;
    }catch(error){
      this.clearPolygons();
      const code=error instanceof Error?error.message:'SIGMET_UNAVAILABLE';
      const message=code==='NOAA_SIGMET_RATE_LIMIT'
        ?'SIGMET · NOAA制限中'
        :code==='NOAA_SIGMET_UNAVAILABLE'
          ?'SIGMET · NOAA接続失敗'
          :'SIGMET · API取得失敗';
      console.error('SIGMET_FETCH_FAILED',error);
      this.updateStatus(0,message,false);
      this.scheduleRefresh();
      return this.status;
    }

    this.data=body;
    try{
      this.render();
    }catch(error){
      console.error('SIGMET_RENDER_FAILED',error);
      this.clearPolygons();
      this.updateStatus(0,'SIGMET · 3D描画失敗',Boolean(body.stale));
    }
    this.scheduleRefresh();
    return this.status;
  }

  public getStatus():SigmetLayerStatus{return this.status;}

  private render():void{
    this.clearPolygons();
    if(!this.enabled||!this.data||this.route.length<2)return;

    const nearby=this.data.features.filter(feature=>featureNearRoute(feature,this.route));
    for(const feature of nearby){
      const style=hazardStyle(feature.properties.hazard);
      const renderPolygon=(outer:LngLat[],holes:LngLat[][]=[])=>{
        if(!outer||outer.length<4)return;
        const element=new this.lib.Polygon3DInteractiveElement({
          altitudeMode:this.lib.AltitudeMode.CLAMP_TO_GROUND,
          fillColor:style.fill,
          strokeColor:style.stroke,
          strokeWidth:3,
          drawsOccludedSegments:true,
          geodesic:true,
          zIndex:12,
        });
        element.path=outer.map(([lng,lat])=>({lat,lng}));
        if(holes.length){
          element.innerPaths=holes.map(ring=>ring.map(([lng,lat])=>({lat,lng})));
        }
        element.setAttribute('title',this.featureTitle(feature));
        element.addEventListener('gmp-click',()=>{
          this.map.dispatchEvent(new CustomEvent('skyroute-sigmet-click',{
            detail:{...feature.properties,id:feature.id,geometryType:feature.geometry.type},
            bubbles:true,
          }));
        });
        this.map.appendChild(element);
        this.polygons.push(element);
      };

      for(const polygon of featurePolygons(feature)){
        const [outer,...holes]=polygon;
        renderPolygon(outer,holes);
      }

      // Point SIGMETs carry a location but no warning boundary. Draw a compact
      // visual-radius circle so the location remains visible without implying
      // that NOAA supplied an exact polygon.
      for(const point of featurePoints(feature)){
        renderPolygon(pointCircleRing(point));
      }
    }

    const stale=Boolean(this.data.stale);
    this.updateStatus(
      nearby.length,
      `SIGMET ON · ${nearby.length}件${stale?' · cached':''}`,
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

  private scheduleRefresh():void{
    window.clearTimeout(this.refreshTimer);
    if(!this.enabled||this.route.length<2)return;
    this.refreshTimer=window.setTimeout(()=>void this.setEnabled(true),5*60*1000);
  }

  private updateStatus(count:number,message:string,stale:boolean):void{
    this.status={enabled:this.enabled,count,message,stale};
    this.statusListener?.(this.status);
  }

  public destroy():void{
    this.enabled=false;
    window.clearTimeout(this.refreshTimer);
    this.refreshTimer=0;
    this.clearPolygons();
    this.route=[];
    this.data=null;
  }
}
