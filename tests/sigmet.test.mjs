import assert from 'node:assert/strict';
import { createSigmetService } from '../server/sigmet.mjs';

const now=Date.parse('2026-09-26T06:00:00Z');
let calls=0;
const fetcher=async()=>{
  calls+=1;
  return new Response(JSON.stringify({
    type:'FeatureCollection',
    features:[
      {
        type:'Feature',
        id:1,
        properties:{
          icaoId:'RJTD',
          firId:'RJJJ',
          firName:'FUKUOKA',
          hazard:'TS',
          validTimeFrom:Math.floor((now-30*60*1000)/1000),
          validTimeTo:Math.floor((now+90*60*1000)/1000),
          altitudeHi1:45000,
        },
        geometry:{
          type:'Polygon',
          coordinates:[[[139,34],[142,34],[142,37],[139,37],[139,34]]],
        },
      },
      {
        type:'Feature',
        id:2,
        properties:{
          hazard:'TURB',
          validTimeFrom:Math.floor((now-3*60*60*1000)/1000),
          validTimeTo:Math.floor((now-2*60*60*1000)/1000),
        },
        geometry:{
          type:'Polygon',
          coordinates:[[[130,30],[131,30],[131,31],[130,31],[130,30]]],
        },
      },
    ],
  }),{status:200,headers:{'Content-Type':'application/geo+json'}});
};

const service=createSigmetService({fetcher,now:()=>now,logger:()=>{}});
const first=await service();
assert.equal(first.type,'FeatureCollection');
assert.equal(first.features.length,1,'expired SIGMET is removed');
assert.equal(first.features[0].properties.hazard,'TS');
assert.equal(first.features[0].properties.altitudeHighFeet,45000);
assert.equal(first.cached,false);

const second=await service();
assert.equal(second.features.length,1);
assert.equal(second.cached,true,'second request uses five-minute cache');
assert.equal(calls,1,'NOAA is called only once while cache is valid');

console.log('Passed: current SIGMET filtering, normalization and cache.');
