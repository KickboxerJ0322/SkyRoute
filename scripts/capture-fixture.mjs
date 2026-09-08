import { readFile, writeFile } from 'node:fs/promises';
try {process.loadEnvFile('.env.local');}catch(error){if(error.code!=='ENOENT')throw error;}
const key=process.env.AEROAPI_KEY;
if(!key||key==='YOUR_FLIGHTAWARE_AEROAPI_KEY')throw new Error('Set AEROAPI_KEY in .env.local first.');
const id=process.argv[2];
if(id&&!/^[A-Za-z0-9_-]{1,180}$/.test(id))throw new Error('Expected fa_flight_id.');
const start=new Date(),end=new Date(start.getTime()+10800000);
const formatBound=date=>date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const paths=id?[`/flights/${id}`,`/flights/${id}/route`,`/flights/${id}/track`,`/flights/${id}/position`]:[`/airports/RJTT/flights/scheduled_departures?${new URLSearchParams({start:formatBound(start),end:formatBound(end),max_pages:'1'})}`];
const allowed=new Set(['flights','scheduled_departures','fixes','positions','last_position','fa_flight_id','ident','ident_icao','operator','operator_icao','flight_number','origin','destination','code','code_icao','code_iata','name','latitude','longitude','elevation','aircraft_type','status','cancelled','scheduled_out','scheduled_off','estimated_out','estimated_off','actual_out','actual_off','scheduled_in','scheduled_on','estimated_in','estimated_on','actual_in','actual_on','altitude','groundspeed','heading','timestamp']);
const sanitize=value=>Array.isArray(value)?value.map(sanitize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>allowed.has(k)).map(([k,v])=>[k,sanitize(v)])):value;
const records={capturedAt:start.toISOString(),description:'Sanitized FlightAware fixture; historical snapshot, not live.',responses:{}};
try {
  const previous=JSON.parse(await readFile('server/fixtures/captured.json','utf8'));
  records.responses={...previous.responses};
} catch(error) {if(error.code!=='ENOENT')throw new Error('Existing fixture is invalid; move it before capturing.');}
for(const path of paths) {
  const response=await fetch('https://aeroapi.flightaware.com/aeroapi'+path,{headers:{'x-apikey':key},signal:AbortSignal.timeout(10000)});
  if(!response.ok){console.log(`${path.split('?')[0]}: HTTP ${response.status}`);continue;}
  records.responses[path.split('?')[0]]=sanitize(await response.json());
  console.log(`${path.split('?')[0]}: saved`);
}
await writeFile('server/fixtures/captured.json',JSON.stringify(records,null,2)+'\n');
