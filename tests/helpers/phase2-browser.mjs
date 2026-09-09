import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const scenario=JSON.parse(readFileSync('server/fixtures/scenarios.json','utf8').replace(/^\uFEFF/,''));
const airport=code=>{const a=scenario.airports[code];return {icao:code,iata:a.code_iata,name:a.name,latitude:a.latitude,longitude:a.longitude,altitudeMeters:a.elevation*.3048};};
const flight=(id='test-ana',status='SCHEDULED')=>({id,ident:id==='test-jal'?'JAL107':'ANA53',operator:id==='test-jal'?'JAL':'ANA',callsign:null,flightNumber:'53',origin:airport('RJTT'),destination:airport(id==='test-jal'?'RJOO':'RJCC'),aircraftType:'B738',status,scheduledDeparture:new Date(Date.now()+600000).toISOString(),estimatedDeparture:null,actualDeparture:null,scheduledArrival:new Date(Date.now()+7200000).toISOString(),estimatedArrival:null,actualArrival:null});
const point=(lat=36,time=Date.now(),heading=359)=>({latitude:lat,longitude:140,altitudeMeters:10000,groundSpeedKmh:850,heading,timestamp:new Date(time).toISOString(),altitudeEstimated:false});
const envelope=data=>({data,source:'mock',fetchedAt:new Date().toISOString(),stale:false});
export async function setup(page,{enroute=false,slowFirst=false,plateauDefault=false}={}) {
  if(!plateauDefault)await page.addInitScript(()=>localStorage.setItem('skyroute.plateau.enabled','false'));
  // Contract doubles only: do not claim these tests validate Google's 3D renderer.
  await page.addInitScript(()=>{
    class Map extends HTMLElement {constructor(options={}){super();Object.assign(this,options);}stopCameraAnimation(){}flyCameraTo({endCamera}){Object.assign(this,endCamera);}}
    class Model extends HTMLElement {constructor(options={}){super();Object.assign(this,options);}}
    class Polygon extends HTMLElement {constructor(options={}){super();Object.assign(this,options);}set innerPaths(value){if(!value.length)throw new Error("empty innerPaths");this.holes=value;}get innerPaths(){return this.holes;}}
    class Line extends HTMLElement {constructor(options={}){super();Object.assign(this,options);}}
    customElements.define('gmp-polygon-3d-interactive',Polygon);customElements.define('gmp-map-3d',Map);customElements.define('gmp-model-3d',Model);customElements.define('gmp-polyline-3d',Line);
    window.google={maps:{importLibrary:async()=>({Map3DElement:Map,Model3DElement:Model,Polyline3DElement:Line,Polygon3DInteractiveElement:Polygon,AltitudeMode:{ABSOLUTE:'ABSOLUTE',RELATIVE_TO_MESH:'RELATIVE_TO_MESH'}})}};
  });
  const requests=[];let positions=0;
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;requests.push(path);
    const id=path.includes('test-jal')?'test-jal':'test-ana';
    let data;
    if(path.endsWith('/departures'))data=[enroute?{...flight('test-ana','ENROUTE'),scheduledDeparture:new Date(Date.now()-3600000).toISOString(),actualDeparture:new Date(Date.now()-3500000).toISOString()}:flight(),flight('test-jal')];
    else if(path.endsWith('/route')) {if(slowFirst&&id==='test-ana')await new Promise(r=>setTimeout(r,500));data={type:'FILED',waypoints:[],altitudeEstimated:true};}
    else if(path.endsWith('/track'))data=enroute?[point(35.9,Date.now()-60000),point(36)]:[];
    else if(path.endsWith('/position'))data=point(36+positions++*.1,Date.now()+positions*45000,positions===1?359:1);
    else data=flight(id,enroute?'ENROUTE':'SCHEDULED');
    await route.fulfill({json:envelope(data)});
  });
  await page.goto('/?debug=1');await expect(page.locator('.live-routes .route-card')).toHaveCount(2);
  return requests;
}
