import { deflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { createNowcastService } from '../server/nowcast.mjs';

const now=Date.parse('2026-09-26T09:00:00Z');
let calls=0;
const fetcher=async url=>{
  calls+=1;
  if(String(url).includes('targetTimes_N1.json')){
    return new Response(JSON.stringify([
      {basetime:'20260926085500',validtime:'20260926085500',elements:['hrpns']},
      {basetime:'20260926085000',validtime:'20260926085000',elements:['hrpns']},
    ]),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(String(url).includes('targetTimes_N2.json')){
    return new Response(JSON.stringify([
      {basetime:'20260926085500',validtime:'20260926095500',elements:['hrpns']},
      {basetime:'20260926085500',validtime:'20260926092500',elements:['hrpns']},
      {basetime:'20260926085500',validtime:'20260926090000',elements:['hrpns']},
    ]),{status:200,headers:{'Content-Type':'application/json'}});
  }
  return new Response(JSON.stringify([
    {basetime:'20260926085000',validtime:'20260926085000',elements:['thns','trns']},
    {basetime:'20260926085000',validtime:'20260926095000',elements:['thns','trns']},
  ]),{status:200,headers:{'Content-Type':'application/json'}});
};

const service=createNowcastService({fetcher,now:()=>now});
const first=await service();
assert.equal(first.current.validtime,'20260926085500');
assert.equal(first.forecast60.validtime,'20260926095500');
assert.ok(first.tileTemplate.includes('{basetime}'));
assert.equal(first.cached,false);

const second=await service();
assert.equal(second.cached,true);
assert.equal(calls,3,'rain and hazard target-time indexes are cached together');

console.log('Passed: JMA nowcast current/+60 minute selection and cache.');


const pngChunk=(type,data)=>{
  const typeBytes=Buffer.from(type,'ascii');
  const length=Buffer.alloc(4);length.writeUInt32BE(data.length);
  const crc=Buffer.alloc(4); // decoder intentionally ignores CRC
  return Buffer.concat([length,typeBytes,data,crc]);
};

const solidRgbaPng=rgba=>{
  const width=256,height=256;
  const header=Buffer.alloc(13);
  header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);
  header[8]=8;header[9]=6;header[10]=0;header[11]=0;header[12]=0;
  const raw=Buffer.alloc(height*(1+width*4));
  let offset=0;
  for(let y=0;y<height;y++){
    raw[offset++]=0;
    for(let x=0;x<width;x++){
      raw[offset++]=rgba[0];raw[offset++]=rgba[1];raw[offset++]=rgba[2];raw[offset++]=rgba[3];
    }
  }
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR',header),
    pngChunk('IDAT',deflateSync(raw)),
    pngChunk('IEND',Buffer.alloc(0)),
  ]);
};

const heavyRainPng=solidRgbaPng([255,153,0,255]);
const thunderPng=solidRgbaPng([255,0,0,255]);
const tornadoPng=solidRgbaPng([255,0,0,255]);
const analysisFetcher=async url=>{
  const value=String(url);
  if(value.includes('targetTimes_N1.json')){
    return new Response(JSON.stringify([
      {basetime:'20260926085500',validtime:'20260926085500',elements:['hrpns']},
    ]),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(value.includes('targetTimes_N2.json')){
    return new Response(JSON.stringify([
      {basetime:'20260926085500',validtime:'20260926095500',elements:['hrpns']},
    ]),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(value.includes('targetTimes_N3.json')){
    return new Response(JSON.stringify([
      {basetime:'20260926085000',validtime:'20260926085000',elements:['thns','trns']},
      {basetime:'20260926085000',validtime:'20260926095000',elements:['thns','trns']},
    ]),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(value.includes('/surf/thns/')){
    return new Response(thunderPng,{status:200,headers:{'Content-Type':'image/png'}});
  }
  if(value.includes('/surf/trns/')){
    return new Response(tornadoPng,{status:200,headers:{'Content-Type':'image/png'}});
  }
  if(value.endsWith('.png')){
    return new Response(heavyRainPng,{status:200,headers:{'Content-Type':'image/png'}});
  }
  return new Response('not found',{status:404});
};

const analysisService=createNowcastService({fetcher:analysisFetcher,now:()=>now});
const analysis=await analysisService.analyzePoint(35.5494,139.7798);
assert.equal(analysis.current.center.status,'available');
assert.equal(analysis.current.center.minMmPerHour,30);
assert.equal(analysis.current.center.maxMmPerHour,50);
assert.equal(analysis.current.nearbyMax.label,'激しい雨');
assert.equal(analysis.forecast60.center.minMmPerHour,30);
assert.equal(analysis.thunder.current.center.level,3);
assert.equal(analysis.thunder.forecast60.nearbyMax.level,3);
assert.equal(analysis.tornado.current.center.level,2);
assert.equal(analysis.tornado.forecast60.nearbyMax.level,2);

console.log('Passed: structured JMA rain/thunder/tornado nowcast analysis.');

const area=await analysisService.analyzeArea(35.5494,139.7798,30);
assert.equal(area.current.radiusKm,30);
assert.equal(area.current.stepKm,5);
assert.ok(area.current.cells.length>0);
assert.equal(area.current.cells[0].minMmPerHour,30);
assert.equal(area.forecast60.cells[0].maxMmPerHour,50);
assert.ok(area.thunder.current.cells.length>0);
assert.equal(area.thunder.current.cells[0].level,3);
assert.ok(area.tornado.current.cells.length>0);
assert.equal(area.tornado.current.cells[0].level,2);
assert.match(area.note,/not cloud-top, lightning, or tornado height/);

console.log('Passed: local 30 km NOWCAST grids for 3D rain/thunder/tornado.');
