import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const scenario=JSON.parse(readFileSync('server/fixtures/scenarios.json','utf8').replace(/^\uFEFF/,''));
const airport=code=>{const a=scenario.airports[code];return {icao:code,iata:a.code_iata,name:a.name,latitude:a.latitude,longitude:a.longitude,altitudeMeters:a.elevation*.3048};};
const flight=(id='test-ana',status='SCHEDULED')=>({id,ident:id==='test-jal'?'JAL107':'ANA53',operator:id==='test-jal'?'JAL':'ANA',callsign:null,flightNumber:'53',origin:airport('RJTT'),destination:airport(id==='test-jal'?'RJOO':'RJCC'),aircraftType:'B738',status,scheduledDeparture:new Date(Date.now()+600000).toISOString(),estimatedDeparture:null,actualDeparture:null,scheduledArrival:new Date(Date.now()+7200000).toISOString(),estimatedArrival:null,actualArrival:null});
const point=(lat=36,time=Date.now(),heading=359)=>({latitude:lat,longitude:140,altitudeMeters:10000,groundSpeedKmh:850,heading,timestamp:new Date(time).toISOString(),altitudeEstimated:false});
const envelope=data=>({data,source:'mock',fetchedAt:new Date().toISOString(),stale:false});
async function setup(page,{enroute=false,slowFirst=false}={}) {
  // Contract doubles only: do not claim these tests validate Google's 3D renderer.
  await page.addInitScript(()=>{
    class Map extends HTMLElement {constructor(options={}){super();Object.assign(this,options);}stopCameraAnimation(){}flyCameraTo({endCamera}){Object.assign(this,endCamera);}}
    class Model extends HTMLElement {constructor(options={}){super();Object.assign(this,options);}}
    class Line extends HTMLElement {constructor(options={}){super();Object.assign(this,options);}}
    customElements.define('gmp-map-3d',Map);customElements.define('gmp-model-3d',Model);customElements.define('gmp-polyline-3d',Line);
    window.google={maps:{importLibrary:async()=>({Map3DElement:Map,Model3DElement:Model,Polyline3DElement:Line,AltitudeMode:{ABSOLUTE:'ABSOLUTE'}})}};
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
test('LIVE list, local filters, fallback route, preview, DEMO and camera controls',async({page})=>{
  const requests=await setup(page);expect(requests).toEqual(['/api/flights/departures']);
  await page.getByLabel('Airline filter').selectOption('JAL');await expect(page.locator('.live-routes .route-card')).toHaveCount(1);expect(requests).toHaveLength(1);
  await page.getByLabel('Airline filter').selectOption('ALL');await page.locator('[data-flight="test-ana"]').click();
  await expect(page.locator('#live-route-type')).toHaveText('ESTIMATED');await expect(page.locator('#live-flight-status')).toHaveText('SCHEDULED');
  await expect(page.locator('#live-altitude')).toHaveText('--');expect(requests.some(p=>p.endsWith('/position'))).toBe(false);
  await page.locator('#live-preview').click();await expect(page.locator('#live-view-mode')).toHaveText('PREVIEW');await expect(page.locator('#play-pause-btn')).toBeEnabled();
  await page.locator('#play-pause-btn').click();
  const orientation=await page.locator('gmp-model-3d').evaluate(el=>({...el.orientation}));
  const heading=await page.locator('gmp-map-3d').evaluate(el=>el.heading);
  await page.locator('[data-offset="90"]').click();const changed=await page.locator('gmp-map-3d').evaluate(el=>el.heading);expect(Math.round(changed)).toBe((Math.round(heading)+90)%360);
  await page.locator('[data-tilt="45"]').click();expect(await page.locator('gmp-map-3d').evaluate(el=>el.tilt)).toBe(45);
  expect(await page.locator('gmp-model-3d').evaluate(el=>({...el.orientation}))).toEqual(orientation);
  await page.locator('#data-demo').click();await expect(page.locator('.route-card')).toHaveCount(4);await expect(page.locator('#data-source-status')).toContainText('DEMO');
  await page.locator('#reverse-play-btn').click();await expect(page.locator('#reverse-play-btn')).toHaveClass(/active-reverse/);
});
test('desktop panels do not overlap and can all be hidden/restored',async({page})=>{
  await setup(page);await page.locator('[data-flight="test-ana"]').click();await expect(page.locator('#live-route-type')).toHaveText('ESTIMATED');
  const sidebar=await page.locator('#left-panel-container').boundingBox();const playback=await page.locator('#playback-container').boundingBox();expect(playback.x).toBeGreaterThanOrEqual(sidebar.x+sidebar.width);
  for(const id of ['flight-panel-root','flight-info-root','map-controls-container','playback-container']){await page.locator(`[aria-controls="${id}"]`).click();await expect(page.locator('#'+id)).toBeHidden();}
  await expect(page.locator('#data-demo')).toBeVisible();
  for(const id of ['flight-panel-root','flight-info-root','map-controls-container','playback-container']){await page.locator(`[aria-controls="${id}"]`).click();await expect(page.locator('#'+id)).toBeVisible();}
  await page.screenshot({path:'tests/phase2-desktop.png'});
});
test('mobile drawer, selection details and playback have separate space',async({page})=>{
  await page.setViewportSize({width:390,height:844});await setup(page);
  await page.locator('#mobile-departures-btn').click();await expect(page.locator('.live-panel')).toHaveClass(/open-mobile/);
  await page.locator('[data-flight="test-ana"]').click();await expect(page.locator('#live-route-type')).toHaveText('ESTIMATED');
  const info=await page.locator('#flight-info-root').boundingBox();const playback=await page.locator('#playback-container').boundingBox();expect(info.y+info.height).toBeLessThanOrEqual(playback.y);
  const controls=await page.locator('#map-controls-container').boundingBox();expect(controls.x+controls.width).toBeLessThanOrEqual(390);
  await page.screenshot({path:'tests/phase2-mobile.png'});
});
test('rapid selection does not allow older route response to overwrite flight',async({page})=>{
  await setup(page,{slowFirst:true});await page.locator('[data-flight="test-ana"]').click();await page.locator('[data-flight="test-jal"]').click();
  await expect(page.locator('#live-route-type')).toHaveText('ESTIMATED');await page.waitForTimeout(700);await expect(page.locator('.live-info .hud-route-text')).toContainText('JAL107');
});
test('ENROUTE polls only selected flight, interpolates positions and stops on DEMO',async({page})=>{
  test.setTimeout(60000);
  await page.clock.install();const requests=await setup(page,{enroute:true});
  await page.getByLabel('Flight status filter').selectOption('ENROUTE');await expect(page.locator('.live-routes .route-card')).toHaveCount(1);
  await expect(page.locator('.live-routes .route-status')).toHaveText('飛行中');
  await page.getByLabel('Flight status filter').selectOption('UPCOMING');await expect(page.locator('[data-flight="test-jal"]')).toBeVisible();
  await page.getByLabel('Flight status filter').selectOption('ENROUTE');await page.locator('[data-flight="test-ana"]').click();
  await expect(page.locator('#live-altitude')).toContainText('10,000');
  const initial=await page.locator('gmp-model-3d').evaluate(el=>el.position.lat);
  expect(requests.filter(p=>p.endsWith('/position'))).toHaveLength(1);
  await page.clock.fastForward(46000);await expect.poll(()=>requests.filter(p=>p.endsWith('/position')).length).toBe(2);
  await page.clock.fastForward(22000);const next=await page.locator('gmp-model-3d').evaluate(el=>el.position.lat);expect(next).toBeGreaterThan(initial);expect(next).toBeLessThan(36.1);
  expect(requests.filter(p=>p.endsWith('/track'))).toHaveLength(1);
  await page.locator('#data-demo').click();const count=requests.length;await page.clock.fastForward(60000);expect(requests).toHaveLength(count);
});
test('departure API failure leaves DEMO accessible',async({page})=>{
  await setup(page);await page.route('**/api/flights/departures',route=>route.fulfill({status:503,json:{error:'API_KEY_MISSING'}}));
  await page.locator('#refresh-flights').click();await expect(page.locator('.live-list-message')).toContainText('API_KEY_MISSING');await page.locator('#data-demo').click();await expect(page.locator('.route-card')).toHaveCount(4);
});
