import { loadRecordedFixture } from './recordedFixture.mjs';
﻿import { Cache, ApiError } from './cache.mjs';
import { createMock } from './mock.mjs';
import { HND, flight, airport, position, track, filedRoute } from './normalize.mjs';
export const TTL = { departures:180000, detail:60000, position:45000, track:180000, route:1800000, airport:86400000 };
export function createAeroApi({mode=process.env.SKYROUTE_DATA_MODE||'mock', key=process.env.AEROAPI_KEY, fetcher=fetch, now=Date.now,
  maxCalls=Number(process.env.AEROAPI_MAX_CALLS_PER_MINUTE)||20, logger=console.log}={}) {
  if(!['mock','live'].includes(mode)) throw new Error('SKYROUTE_DATA_MODE must be mock or live');
  const cache=new Cache(now), mock=(mode==='mock'?loadRecordedFixture(process.env.SKYROUTE_FIXTURE_FILE):null)||createMock(now);
  let calls=[], cooldownUntil=0;
  async function request(path) {
    if(mode==='mock') return mock(path);
    if(!key||key==='YOUR_FLIGHTAWARE_AEROAPI_KEY') throw new ApiError(503,'API_KEY_MISSING');
    calls=calls.filter(t=>now()-t<60000);
    if(now()<cooldownUntil||calls.length>=Math.max(1,Math.min(60,maxCalls))) throw new ApiError(429,'RATE_LIMIT');
    calls.push(now());
    let response;
    try { response=await fetcher('https://aeroapi.flightaware.com/aeroapi'+path,{headers:{'x-apikey':key,Accept:'application/json'},signal:AbortSignal.timeout(10000)}); }
    catch { cooldownUntil=now()+60000; throw new ApiError(504,'API_UNAVAILABLE'); }
    if(!response.ok) {
      cooldownUntil=now()+([401,403,429].includes(response.status)?60000:response.status>=500?30000:0);
      throw new ApiError(response.status,[401,403].includes(response.status)?'API_KEY_OR_PLAN_ERROR':response.status===404?'DATA_UNAVAILABLE':response.status===429?'RATE_LIMIT':'API_UNAVAILABLE');
    }
    try { return await response.json(); } catch { throw new ApiError(502,'INVALID_API_RESPONSE'); }
  }
  async function cached(key,ttl,path,normalize) {
    const start=now(), hit=cache.entries.get(key)?.expires>now();
    try { const result=await cache.get(key,ttl,async()=>normalize(await request(typeof path==='function'?path():path)));
      logger(JSON.stringify({endpoint:key.split(':')[0],status:200,cache:hit?'hit':'miss',duration:now()-start}));
      return {...result,source:mode};
    } catch(error) {logger(JSON.stringify({endpoint:key.split(':')[0],status:error.status||500,cache:'miss',duration:now()-start})); throw error;}
  }
  const api = {
    mode,
    scheduledDepartures:()=>cached('departures:RJTT:current-window',TTL.departures,()=>{
      const formatBound=value=>new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const query=new URLSearchParams({start:formatBound(now()),end:formatBound(now()+3*3600000),max_pages:'1'});
      return `/airports/${HND.icao}/flights/scheduled_departures?${query}`;
    },raw=>{
      if(!Array.isArray(raw.scheduled_departures)) throw new ApiError(502,'INVALID_API_RESPONSE');
      return raw.scheduled_departures.map(flight).filter(f=>f&&f.origin.icao===HND.icao&&Date.parse(f.scheduledDeparture)>=now()&&Date.parse(f.scheduledDeparture)<=now()+3*3600000&&!['DEPARTED','ENROUTE','ARRIVED'].includes(f.status))
        .sort((a,b)=>Date.parse(a.scheduledDeparture)-Date.parse(b.scheduledDeparture)).filter((f,i,all)=>all.findIndex(x=>x.id===f.id)===i).slice(0,20);
    }),
    airborne:()=>cached('airborne:RJTT',TTL.departures,()=>{
      const formatBound=value=>new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z');
      return `/airports/${HND.icao}/flights/departures?${new URLSearchParams({start:formatBound(now()-24*3600000),end:formatBound(now()),max_pages:'1'})}`;
    },raw=>{
      if(!Array.isArray(raw.departures)) throw new ApiError(502,'INVALID_API_RESPONSE');
      return raw.departures.map(flight).filter(f=>f&&f.origin.icao===HND.icao&&f.status==='ENROUTE')
        .sort((a,b)=>Date.parse(b.actualDeparture)-Date.parse(a.actualDeparture))
        .filter((f,i,all)=>all.findIndex(x=>x.id===f.id)===i).slice(0,20);
    }),
    departures:async()=>{
      const results=await Promise.allSettled([api.airborne(),api.scheduledDepartures()]);
      const available=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
      if(!available.length) throw results[0].reason;
      const partial=available.length!==results.length;
      return {data:available.flatMap(r=>r.data).filter((f,i,all)=>all.findIndex(x=>x.id===f.id)===i),source:mode,
        fetchedAt:available.map(r=>r.fetchedAt).sort()[0],stale:partial||available.some(r=>r.stale),
        ...(partial?{warning:results[0].status==='rejected'?'飛行中の便を取得できませんでした':'出発予定便を取得できませんでした'}:{})};
    },
    detail:id=>cached('detail:'+id,TTL.detail,`/flights/${encodeURIComponent(id)}?max_pages=1`,raw=>{
      const found=(raw.flights||[]).find(f=>f.fa_flight_id===id); if(!found) throw new ApiError(404,'DATA_UNAVAILABLE'); return flight(found);
    }),
    route:id=>cached('route:'+id,TTL.route,`/flights/${encodeURIComponent(id)}/route`,filedRoute),
    track:id=>cached('track:'+id,TTL.track,`/flights/${encodeURIComponent(id)}/track`,track),
    position:id=>cached('position:'+id,TTL.position,`/flights/${encodeURIComponent(id)}/position`,raw=>position(raw.last_position)),
    airport:id=>cached('airport:'+id,TTL.airport,`/airports/${encodeURIComponent(id)}`,airport),
  };
  return api;
}
