import type { SkyRoutePosition } from './liveTypes';
import { distanceBetween, bearingBetween } from '../utils/geo';
import { lerpAngle } from '../utils/interpolation';
import { sphericalPoint } from './liveGeometry';
const latLng=(p:SkyRoutePosition)=>({lat:p.latitude,lng:p.longitude});
export class LiveFlightInterpolator {
  private from:SkyRoutePosition|null=null;
  private target:SkyRoutePosition|null=null;
  private start=0;
  private duration=45000;
  reset() {this.from=null;this.target=null;}
  push(next:SkyRoutePosition,now=performance.now()):boolean {
    if(!Number.isFinite(next.latitude)||!Number.isFinite(next.longitude)||Math.abs(next.latitude)>90||Math.abs(next.longitude)>180||!Number.isFinite(Date.parse(next.timestamp)))return false;
    if(next.altitudeMeters!==null&&(next.altitudeMeters < -500 || next.altitudeMeters>22000))return false;
    if(this.target) {
      const seconds=(Date.parse(next.timestamp)-Date.parse(this.target.timestamp))/1000;
      if(seconds<=0||distanceBetween(latLng(this.target),latLng(next))>seconds*420+2000)return false;
      if(next.heading===null)next={...next,heading:distanceBetween(latLng(this.target),latLng(next))>1?bearingBetween(latLng(this.target),latLng(next)):this.target.heading};
      this.from=this.sample(now);
      this.duration=Math.max(1000,Math.min(60000,seconds*1000));
    } else this.from={...next};
    this.target={...next};this.start=now;return true;
  }
  sample(now=performance.now()):SkyRoutePosition|null {
    if(!this.from||!this.target)return null;
    const t=Math.max(0,Math.min(1,(now-this.start)/this.duration));
    const interpolate=(a:number|null,b:number|null)=>a===null||b===null?b:a+(b-a)*t;
    return {...this.target,...sphericalPoint(this.from,this.target,t),altitudeMeters:interpolate(this.from.altitudeMeters,this.target.altitudeMeters),
      groundSpeedKmh:interpolate(this.from.groundSpeedKmh,this.target.groundSpeedKmh),
      heading:this.from.heading===null||this.target.heading===null?this.target.heading:lerpAngle(this.from.heading,this.target.heading,t)};
  }
}
