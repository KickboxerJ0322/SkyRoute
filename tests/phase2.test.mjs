import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createAeroApi, TTL } from '../server/aeroApi.mjs';
import { Cache, ApiError } from '../server/cache.mjs';
import { flight, position, track, status } from '../server/normalize.mjs';
import { createApp } from '../server/index.mjs';
const compiled=await build({stdin:{contents:`export {chooseRoute, formatJst} from './src/flight/AeroApiFlightProvider'; export {greatCirclePoints} from './src/flight/liveGeometry'; export {LiveFlightInterpolator} from './src/flight/LiveFlightInterpolator';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {chooseRoute,formatJst,greatCirclePoints,LiveFlightInterpolator}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-09-06T00:00:00Z');
const rawFlight={fa_flight_id:'ANA53-123-airline-01',ident:'ANA53',operator_icao:'ANA',origin:{code_icao:'RJTT',code_iata:'HND'},destination:{code_icao:'RJCC',code_iata:'CTS'},scheduled_out:new Date(now+60000).toISOString(),scheduled_in:new Date(now+5400000).toISOString()};
const rawPosition={latitude:35,longitude:140,altitude:340,groundspeed:450,heading:359,timestamp:new Date(now).toISOString()};
const silent=()=>{};
test('v4 normalization, nullable values, identifiers and JST',()=>{
  assert.equal(position(rawPosition).altitudeMeters,10363.2);
  assert.ok(Math.abs(position(rawPosition).groundSpeedKmh-833.4)<1e-8);
  assert.equal(position({...rawPosition,altitude:null}).altitudeMeters,null);
  assert.equal(position({...rawPosition,latitude:null}),null);
  assert.equal(position({...rawPosition,altitude:10000}),null);
  assert.equal(flight(rawFlight).id,rawFlight.fa_flight_id);
  assert.equal(flight(rawFlight).aircraftType,null);
  assert.equal(flight(rawFlight).estimatedDeparture,null);
  assert.equal(flight({...rawFlight,fa_flight_id:null}),null);
  assert.equal(status({...rawFlight,cancelled:true,actual_off:'x'}),'CANCELLED');
  assert.equal(status({...rawFlight,actual_off:'x'}),'ENROUTE');
  assert.equal(status({...rawFlight,actual_on:'x'}),'ARRIVED');
  assert.match(formatJst('2026-09-05T23:55:00Z'),/09\/06 08:55/);
  assert.equal(formatJst(null),'--');
});
test('cache coalesces concurrent calls and serves stale result on failure',async()=>{
  let clock=now,calls=0;const cache=new Cache(()=>clock);
  const loader=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return [1];};
  await Promise.all(Array.from({length:10},()=>cache.get('a',100,loader)));assert.equal(calls,1);
  clock+=101;const stale=await cache.get('a',100,async()=>{throw new ApiError(503,'API_UNAVAILABLE');});
  assert.equal(stale.stale,true);assert.deepEqual(stale.data,[1]);assert.equal(stale.fetchedAt,new Date(now).toISOString());
});
test('scheduled departures uses one page, exact v4 auth, 3h UTC window, filters and cache',async()=>{
  let calls=0;
  const api=createAeroApi({mode:'live',key:'test-secret',now:()=>now,logger:silent,fetcher:async(url,options)=>{
    calls++;assert.equal(options.headers['x-apikey'],'test-secret');assert.equal(options.headers.Authorization,undefined);
    const u=new URL(url);assert.equal(u.pathname,'/aeroapi/airports/RJTT/flights/scheduled_departures');assert.equal(u.searchParams.get('max_pages'),'1');
    assert.equal(Date.parse(u.searchParams.get('end'))-Date.parse(u.searchParams.get('start')),10800000);
    for(const bound of ['start','end']) assert.match(u.searchParams.get(bound), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    return Response.json({scheduled_departures:[{...rawFlight,fa_flight_id:'past',scheduled_out:new Date(now-1).toISOString()},rawFlight,rawFlight,{...rawFlight,fa_flight_id:'cancelled',cancelled:true}]});
  }});
  const result=await api.scheduledDepartures();await api.scheduledDepartures();assert.equal(calls,1);assert.equal(result.data.length,2);assert.equal(result.data[1].status,'CANCELLED');assert.equal(JSON.stringify(result).includes('test-secret'),false);
});
test('missing key, auth, 404, 429, server and network errors are sanitized',async()=>{
  await assert.rejects(createAeroApi({mode:'live',key:'',logger:silent}).departures(),/API_KEY_MISSING/);
  for(const [code,message] of [[401,'API_KEY_OR_PLAN_ERROR'],[403,'API_KEY_OR_PLAN_ERROR'],[404,'DATA_UNAVAILABLE'],[429,'RATE_LIMIT'],[500,'API_UNAVAILABLE']]) {
    const api=createAeroApi({mode:'live',key:'hidden',logger:silent,fetcher:async()=>new Response('secret upstream body',{status:code})});
    await assert.rejects(api.position('flight-id'),error=>error.message===message&&!error.message.includes('hidden'));
  }
  await assert.rejects(createAeroApi({mode:'live',key:'hidden',logger:silent,fetcher:async()=>{throw new Error('hidden');}}).departures(),/API_UNAVAILABLE/);
});
test('per-minute cost limiter bounds calls to distinct resources',async()=>{
  let calls=0;const api=createAeroApi({mode:'live',key:'hidden',logger:silent,maxCalls:2,fetcher:async()=>{calls++;return Response.json({last_position:null});}});
  await api.position('a');await api.position('b');await assert.rejects(api.position('c'),/RATE_LIMIT/);assert.equal(calls,2);
});
test('track sorting, duplicates, implausible jumps, altitude gap interpolation',()=>{
  const p=(second,latitude,altitude)=>({...rawPosition,latitude,altitude,timestamp:new Date(now+second*1000).toISOString()});
  const points=track({positions:[p(60,35.1,340),p(0,35,300),p(30,35.05,null),p(30,35.05,null),p(31,80,320),{...p(90,35.2,350),longitude:null}]});
  assert.equal(points.length,3);assert.equal(points[1].altitudeEstimated,true);assert.ok(Math.abs(points[1].altitudeMeters-9753.6)<.01);
});
test('route priority and great-circle fallback cross dateline without wrapping through Greenwich',()=>{
  const airport=(lat,lng)=>({icao:'',iata:null,name:null,latitude:lat,longitude:lng,altitudeMeters:0});
  const f={...flight(rawFlight),origin:airport(35,170),destination:airport(40,-170)};
  const estimated=chooseRoute(f,null,[]);assert.equal(estimated.type,'ESTIMATED');assert.equal(estimated.waypoints.length,65);assert.ok(Math.abs(estimated.waypoints[32].longitude)>170);
  const actual=[position(rawPosition),position({...rawPosition,latitude:35.1})];assert.equal(chooseRoute(f,null,actual).type,'ACTUAL');
  assert.equal(chooseRoute(f,{type:'FILED',waypoints:estimated.waypoints,altitudeEstimated:true},actual).type,'FILED');
  assert.deepEqual(greatCirclePoints({...f.origin,latitude:null},f.destination),[]);
  assert.ok(greatCirclePoints(airport(0,0),airport(0,180)).every(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)));
});
test('live interpolation uses short angle path, rejects outliers and starts smoothly',()=>{
  const interpolator=new LiveFlightInterpolator(),first=position(rawPosition);
  assert.equal(interpolator.push(first,0),true);
  const next=position({...rawPosition,latitude:35.1,heading:1,timestamp:new Date(now+45000).toISOString()});
  assert.equal(interpolator.push(next,45000),true);assert.equal(interpolator.sample(45000).latitude,35);
  const middle=interpolator.sample(67500);assert.ok(middle.latitude>35&&middle.latitude<35.1);assert.ok(Math.abs(middle.heading%360)<.001);
  assert.equal(interpolator.push({...next,latitude:80,timestamp:new Date(now+46000).toISOString()},46000),false);
  assert.equal(interpolator.push(first,47000),false);
  interpolator.reset();assert.equal(interpolator.sample(),null);
});
test('mock scheduled flight transitions into airborne position without external calls',async()=>{
  let clock=now;const api=createAeroApi({mode:'mock',now:()=>clock,logger:silent,fetcher:()=>{throw new Error('must not call');}});
  const list=await api.departures();assert.equal(list.data.length,12);const id=list.data[0].id;
  assert.equal((await api.position(id)).data,null);clock+=121000;
  assert.equal((await api.detail(id)).data.status,'ENROUTE');assert.ok((await api.position(id)).data);assert.ok((await api.track(id)).data.length>=2);
  assert.equal(TTL.route,1800000);assert.equal(TTL.airport,86400000);
});
test('HTTP API and static server reject unknown and traversal paths; no secret leaks',async()=>{
  const app=createApp({api:createAeroApi({mode:'mock',logger:silent})});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  try {const base=`http://127.0.0.1:${app.address().port}`;
    const result=await (await fetch(base+'/api/flights/departures')).json();assert.equal(result.source,'mock');assert.equal(result.data.length,12);
    for(const suffix of ['route','track','position'])assert.equal((await fetch(base+'/api/flights/mock-ana53/'+suffix)).status,200);
    assert.equal((await fetch(base+'/api/flights/invalid%2Fid')).status,400);
    assert.equal((await fetch(base+'/.env.local')).status,404);
    assert.equal((await fetch(base+'/api/unknown')).status,404);
    assert.equal((await fetch(base+'/api/flights/departures',{method:'POST'})).status,405);
    assert.equal((await fetch(base+'/api/health')).headers.get('access-control-allow-origin'),null);
  } finally {await new Promise(r=>app.close(r));}
});


test('combined list includes airborne past departures, excludes landed and other airports, caches both sources',async()=>{
  let calls=0;
  const air={...rawFlight,fa_flight_id:'airborne',scheduled_out:new Date(now-3600000).toISOString(),actual_off:new Date(now-3500000).toISOString()};
  const api=createAeroApi({mode:'live',key:'test',now:()=>now,logger:silent,fetcher:async url=>{
    calls++;const u=new URL(url);assert.equal(u.searchParams.get('max_pages'),'1');
    if(u.pathname.endsWith('/scheduled_departures'))return Response.json({scheduled_departures:[rawFlight]});
    assert.equal(u.pathname,'/aeroapi/airports/RJTT/flights/departures');
    assert.equal(Date.parse(u.searchParams.get('end'))-Date.parse(u.searchParams.get('start')),86400000);
    return Response.json({departures:[air,air,{...air,fa_flight_id:'landed',actual_on:new Date(now).toISOString()},{...air,fa_flight_id:'cancelled',cancelled:true},{...air,fa_flight_id:'other',origin:{code_icao:'RJAA'}},rawFlight]});
  }});
  const result=await api.departures();assert.deepEqual(result.data.map(f=>f.id),['airborne',rawFlight.fa_flight_id]);
  assert.equal(result.data[0].status,'ENROUTE');assert.equal(result.stale,false);await api.departures();assert.equal(calls,2);
});

test('one unavailable list preserves the other list with an explicit partial warning',async()=>{
  const api=createAeroApi({mode:'live',key:'test',now:()=>now,logger:silent,fetcher:async url=>url.includes('scheduled_departures')?Response.json({scheduled_departures:[rawFlight]}):new Response('',{status:404})});
  const result=await api.departures();assert.equal(result.data.length,1);assert.equal(result.stale,true);assert.ok(result.warning);
});
