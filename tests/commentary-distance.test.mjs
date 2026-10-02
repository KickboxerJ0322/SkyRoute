import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlightCommentator,liveDestinationDistanceKm} from '../server/gemini.mjs';
const payload={
  currentPosition:{latitude:35.665,longitude:139.86,timestamp:'2026-10-02T22:13:04Z'},
  flight:{ident:'ANA381',destination:{latitude:35.4922,longitude:133.2364}},
  currentDerived:{distanceRemainingKm:8},
  route:{actualTrack:[{latitude:35.6,longitude:139.8},{latitude:35.665,longitude:139.86}]},
};
test('LIVE distance uses destination airport, not past track or stale derived telemetry',()=>{
  const km=liveDestinationDistanceKm(payload);
  assert.ok(km>590&&km<610);
  assert.equal(liveDestinationDistanceKm({...payload,route:{actualTrack:[]}}),km);
  assert.equal(liveDestinationDistanceKm({...payload,currentPosition:null}),null);
  assert.equal(liveDestinationDistanceKm({...payload,flight:{destination:{latitude:null,longitude:133}}}),null);
  assert.equal(liveDestinationDistanceKm({...payload,currentPosition:{latitude:100,longitude:0}}),null);
  assert.equal(liveDestinationDistanceKm({...payload,demo:true}),null);
  assert.equal(liveDestinationDistanceKm({...payload,currentPosition:payload.flight.destination}),0);
});
test('AI receives corrected km and response preserves natural opening and substitutes the verified distance inline',async()=>{
  let body;
  const ai=createFlightCommentator({key:'test',fetcher:async(_url,options)=>{
    body=JSON.parse(options.body);
    return Response.json({candidates:[{content:{parts:[{text:'現在の状況は、米子行きの便が上昇中です。目的地までの直線距離は約{{DESTINATION_DISTANCE_KM}}キロメートルです。'}]}}]});
  }});
  const response=await ai(payload);
  const data=JSON.parse(body.contents[0].parts[0].text.split('\n').slice(1).join('\n'));
  assert.ok(data.currentDerived.distanceRemainingKm>590);
  assert.match(data.currentDerived.positionObservedAt,/07:13:04\+09:00/);
  assert.equal(response.text,`現在の状況は、米子行きの便が上昇中です。目的地までの直線距離は約${Math.round(liveDestinationDistanceKm(payload))}キロメートルです。`);
  assert.equal(response.text.includes('{{'),false);
  assert.equal((response.text.match(/キロメートル/g)||[]).length,1);
  assert.match(body.systemInstruction.parts[0].text,/段落に自然な一文として一度だけ/);
  assert.match(body.systemInstruction.parts[0].text,/1200文字以内/);
  assert.equal(payload.currentDerived.distanceRemainingKm,8,'input is not mutated');
});
test('commentary may exceed 1000 characters but total stays within 1200',async()=>{
  const generate=text=>createFlightCommentator({key:'test',fetcher:async()=>Response.json({candidates:[{content:{parts:[{text}]}}]})});
  const long='飛行中です。'.repeat(180);
  const response=await generate(long)(payload);
  assert.ok(response.text.length>1000&&response.text.length<=1200);
  const truncated=await generate(long.repeat(2))(payload);
  assert.ok(truncated.text.length<=1200);
  assert.ok(truncated.text.endsWith('。'));
  const missing=await generate('位置は不明です。')({...payload,currentPosition:null});
  assert.equal(missing.text,'位置は不明です。');
});
