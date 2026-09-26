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
  return new Response(JSON.stringify([
    {basetime:'20260926085500',validtime:'20260926095500',elements:['hrpns']},
    {basetime:'20260926085500',validtime:'20260926092500',elements:['hrpns']},
    {basetime:'20260926085500',validtime:'20260926090000',elements:['hrpns']},
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
assert.equal(calls,2,'current and forecast indexes are cached together');

console.log('Passed: JMA nowcast current/+60 minute selection and cache.');
