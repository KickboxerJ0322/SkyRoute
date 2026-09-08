import { readFileSync } from 'node:fs';
import { ApiError } from './cache.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/scenarios.json', import.meta.url),'utf8').replace(/^\uFEFF/,''));
export function createMock(now = Date.now) {
  const epoch = now();
  const iso = minutes => new Date(epoch + minutes * 60000).toISOString();
  function rawFlight(s) {
    const elapsed = (now()-epoch)/60000;
    const airborne = elapsed >= s.minutes && elapsed < s.minutes+90 && !s.cancelled;
    const arrived = elapsed >= s.minutes+90 && !s.cancelled;
    return {fa_flight_id:s.id, ident:s.ident, ident_icao:s.ident, operator_icao:s.operator, flight_number:s.number,
      origin:fixture.airports.RJTT, destination:fixture.airports[s.destination], aircraft_type:s.aircraft,
      scheduled_out:iso(s.minutes), scheduled_in:iso(s.minutes+90), cancelled:!!s.cancelled,
      actual_off:airborne||arrived ? iso(s.minutes):null, actual_on:arrived?iso(s.minutes+90):null,
      status:airborne?'En Route':'Scheduled'};
  }
  function point(s, minute) {
    const origin=fixture.airports.RJTT, dest=fixture.airports[s.destination];
    const t=Math.max(0,Math.min(1,(minute-s.minutes)/90));
    return {latitude:origin.latitude+(dest.latitude-origin.latitude)*t,longitude:origin.longitude+(dest.longitude-origin.longitude)*t,
      altitude:Math.round(Math.min(1,t*5,(1-t)*5)*330),groundspeed:440,heading:null,timestamp:iso(minute)};
  }
  return async path => {
    if (path.startsWith('/airports/RJTT/flights/scheduled_departures')) return {scheduled_departures:fixture.flights.map(rawFlight)};
    if (path.startsWith('/airports/RJTT/flights/departures')) return {departures:fixture.flights.map(rawFlight).filter(f=>f.actual_off)};
    const airport=path.match(/^\/airports\/([^/?]+)$/);
    if (airport) {if(!fixture.airports[airport[1]]) throw new ApiError(404,'DATA_UNAVAILABLE'); return fixture.airports[airport[1]];}
    const match=path.match(/^\/flights\/([^/?]+)(?:\/(route|track|position))?/);
    const s=fixture.flights.find(f=>f.id===decodeURIComponent(match?.[1]||''));
    if(!s) throw new ApiError(404,'DATA_UNAVAILABLE');
    const elapsed=(now()-epoch)/60000;
    if(match[2]==='route') return {fixes:s.destination==='RJCC'?[fixture.airports.RJTT,{latitude:38.8,longitude:140.7},fixture.airports[s.destination]]:[]};
    if(match[2]==='position') return {last_position:elapsed>=s.minutes&&elapsed<s.minutes+90&&!s.cancelled?point(s,elapsed):null};
    if(match[2]==='track') {
      const positions=[];
      if(!s.cancelled) for(let m=s.minutes;m<=Math.min(elapsed,s.minutes+90);m+=1) positions.push(point(s,m));
      return {positions};
    }
    return {flights:[rawFlight(s)]};
  };
}
