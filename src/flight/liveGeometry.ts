import type { SkyRouteAirport, SkyRouteWaypoint } from './liveTypes';
export function sphericalPoint(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number},t:number) {
  const r=Math.PI/180;
  const vector=(p:typeof a)=>[Math.cos(p.latitude*r)*Math.cos(p.longitude*r),Math.cos(p.latitude*r)*Math.sin(p.longitude*r),Math.sin(p.latitude*r)];
  const u=vector(a),v=vector(b),omega=Math.acos(Math.max(-1,Math.min(1,u.reduce((sum,x,i)=>sum+x*v[i],0))));
  if(omega<1e-8)return {...a};
  let axis=v.map((x,i)=>x-u[i]*Math.cos(omega));
  let length=Math.hypot(...axis);
  if(length<1e-8) { const other=Math.abs(u[2])<.9?[0,0,1]:[1,0,0];const dot=other.reduce((s,x,i)=>s+x*u[i],0);axis=other.map((x,i)=>x-dot*u[i]);length=Math.hypot(...axis); }
  const p=u.map((x,i)=>x*Math.cos(omega*t)+axis[i]/length*Math.sin(omega*t));
  return {latitude:Math.atan2(p[2],Math.hypot(p[0],p[1]))/r,longitude:Math.atan2(p[1],p[0])/r};
}
export function greatCirclePoints(a:SkyRouteAirport,b:SkyRouteAirport):SkyRouteWaypoint[] {
  if(a.latitude===null||a.longitude===null||b.latitude===null||b.longitude===null)return [];
  return Array.from({length:65},(_,i)=>{const t=i/64;return {...sphericalPoint({latitude:a.latitude!,longitude:a.longitude!},{latitude:b.latitude!,longitude:b.longitude!},t),
    altitudeMeters:((a.altitudeMeters??10)*(1-t)+(b.altitudeMeters??10)*t)*(1-Math.min(1,t*5,(1-t)*5))+Math.max(10000,a.altitudeMeters??0,b.altitudeMeters??0)*Math.min(1,t*5,(1-t)*5),altitudeEstimated:true};});
}
