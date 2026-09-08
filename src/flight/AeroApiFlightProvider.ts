import type { FlightDataProvider } from './FlightDataProvider';
import type { FlightDeparture, FlightRoute, Airport } from './types';
import type { ApiResult, SkyRouteFlight, SkyRouteRoute, SkyRouteTrackPoint, SkyRoutePosition, SkyRouteAirport } from './liveTypes';
import { greatCirclePoints } from './liveGeometry';
export class AeroApiFlightProvider implements FlightDataProvider {
  source: 'live' | 'mock' = 'mock';
  lastDepartures: ApiResult<SkyRouteFlight[]> | null = null;
  async request<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
    const response = await fetch('/api/'+path, {signal});
    const body = await response.json();
    if(!response.ok) throw new Error(body.error || 'API_UNAVAILABLE');
    this.source = body.source;
    return body;
  }
  async getDepartures(signal?: AbortSignal): Promise<FlightDeparture[]> {
    this.lastDepartures = await this.request<SkyRouteFlight[]>('flights/departures', signal);
    return this.lastDepartures.data.map(f => ({id:f.id, flightNumber:f.ident, airline:f.operator || '--', aircraftType:f.aircraftType || '--',
      destinationCode:f.destination.iata || f.destination.icao || '--', destinationName:f.destination.name || '--', destinationCity:'',
      scheduledTime:formatJst(f.scheduledDeparture), gate:'--', status:f.status}));
  }
  getFlight(id:string,signal?:AbortSignal) { return this.request<SkyRouteFlight>('flights/'+encodeURIComponent(id),signal); }
  getFiledRoute(id:string,signal?:AbortSignal) { return this.request<SkyRouteRoute>('flights/'+encodeURIComponent(id)+'/route',signal); }
  getTrack(id:string,signal?:AbortSignal) { return this.request<SkyRouteTrackPoint[]>('flights/'+encodeURIComponent(id)+'/track',signal); }
  getPosition(id:string,signal?:AbortSignal) { return this.request<SkyRoutePosition|null>('flights/'+encodeURIComponent(id)+'/position',signal); }
  async resolveAirport(airport:SkyRouteAirport,signal?:AbortSignal):Promise<SkyRouteAirport> {
    if(airport.latitude!==null && airport.longitude!==null || !airport.icao) return airport;
    try { return (await this.request<SkyRouteAirport>('airports/'+encodeURIComponent(airport.icao),signal)).data; }
    catch(error) {if(signal?.aborted)throw error;return airport;}
  }
  async getRoute(id:string):Promise<FlightRoute> {
    const flight=(await this.getFlight(id)).data;
    const [filed,track]=await Promise.allSettled([this.getFiledRoute(id),this.getTrack(id)]);
    const [origin,destination]=await Promise.all([this.resolveAirport(flight.origin),this.resolveAirport(flight.destination)]);
    const route=chooseRoute({...flight,origin,destination},filed.status==='fulfilled'?filed.value.data:null,track.status==='fulfilled'?track.value.data:[]);
    if(!route.waypoints.length) throw new Error('Route unavailable.');
    return toAnimationRoute({...flight,origin,destination},route);
  }
}
export function formatJst(value:string|null, seconds=false):string {
  if(!value || !Number.isFinite(Date.parse(value)))return '--';
  return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit' as const}:{})}).format(new Date(value));
}
export function chooseRoute(flight:SkyRouteFlight,filed:SkyRouteRoute|null,track:SkyRouteTrackPoint[]):SkyRouteRoute {
  if(filed && filed.waypoints.length>=2)return filed;
  const points=track.filter(p=>p.altitudeMeters!==null);
  if(points.length>=2)return {type:'ACTUAL',altitudeEstimated:points.some(p=>p.altitudeEstimated),waypoints:points.map(p=>({...p,altitudeMeters:p.altitudeMeters!}))};
  return {type:'ESTIMATED',altitudeEstimated:true,waypoints:greatCirclePoints(flight.origin,flight.destination)};
}
export function toAnimationRoute(flight:SkyRouteFlight,route:SkyRouteRoute):FlightRoute {
  const points=route.waypoints;
  const airport=(a:SkyRouteAirport,index:number):Airport=>({code:a.iata||a.icao||'--',icao:a.icao,name:a.name||'--',city:'',
    lat:a.latitude??points[index].latitude,lng:a.longitude??points[index].longitude,altitude:a.altitudeMeters??points[index].altitudeMeters});
  const duration=(Date.parse(flight.scheduledArrival||'')-Date.parse(flight.scheduledDeparture||''))/1000;
  return {id:flight.id,flightNumber:flight.ident,airline:flight.operator||'--',aircraftType:flight.aircraftType||'--',origin:airport(flight.origin,0),destination:airport(flight.destination,points.length-1),
    durationSeconds:Number.isFinite(duration)&&duration>0?duration:5400,
    waypoints:points.map(p=>({lat:p.latitude,lng:p.longitude,altitude:p.altitudeMeters}))};
}
