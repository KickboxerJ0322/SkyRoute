import {test,expect} from '@playwright/test';
import {setup} from './helpers/phase2-browser.mjs';
const ring=[[139.779,35.549],[139.780,35.549],[139.780,35.550],[139.779,35.549]];
const make=(id,category,name=null)=>({type:'Feature',properties:{gmlId:id,name,usage:null,majorUsage:null,usageCode:null,majorUsageCode:null,measuredHeight:null,storeysAboveGround:null,category,city:'テスト市',dataYear:2025},geometry:{type:'Polygon',coordinates:[ring]}});
// Synthetic test-only objects; never shipped as PLATEAU building data.
const features=[make('test-public','PUBLIC_TRANSPORT','テスト交通施設'),make('test-commercial','COMMERCIAL','<img src=x onerror=alert(1)>'),make('test-medical','MEDICAL'),make('test-other','OTHER')];
features[0].geometry={type:'MultiPolygon',coordinates:[[ring,[[139.7794,35.5492],[139.7795,35.5492],[139.7795,35.5493],[139.7794,35.5492]]],[ring]]};
const collection={type:'FeatureCollection',features};
const polygons=page=>page.locator('gmp-polygon-3d-interactive');
async function mockData(page,data=collection){let calls=0;await page.route('**/data/plateau/haneda-buildings.geojson',r=>{calls++;return r.fulfill({json:data});});return ()=>calls;}

test('PLATEAU is lazy, filters categories, selects a building and restores cached data without interrupting flights',async({page})=>{
  const calls=await mockData(page);await setup(page);
  await expect(page.locator('#plateau-toggle')).toHaveAttribute('aria-pressed','false');await expect(polygons(page)).toHaveCount(0);expect(calls()).toBe(0);
  await page.locator('#plateau-toggle').click();await expect(polygons(page)).toHaveCount(4);expect(calls()).toBe(1);
  await expect(page.getByText('Source: Project PLATEAU / MLIT')).toBeVisible();
  const p=page.locator('[data-plateau-id="test-public"]').first();
  expect(await p.evaluate(p=>({holes:p.innerPaths.length,altitude:p.path[0].altitude,mode:p.altitudeMode,extruded:p.extruded}))).toEqual({holes:1,altitude:1.5,mode:'RELATIVE_TO_MESH',extruded:false});
  await p.dispatchEvent('gmp-click');await expect(page.locator('.plateau-card')).toContainText('テスト交通施設');
  expect(await p.evaluate(p=>p.strokeWidth)).toBe(4);
  await page.locator('[data-plateau-id="test-commercial"]').dispatchEvent('gmp-click');await expect(page.locator('.plateau-card')).toContainText('<img src=x onerror=alert(1)>');await expect(page.locator('.plateau-card img')).toHaveCount(0);expect(await p.evaluate(p=>p.strokeWidth)).toBe(1.5);
  await page.locator('[data-plateau-id="test-medical"]').dispatchEvent('gmp-click');await expect(page.locator('.plateau-card h3')).toHaveCount(0);await expect(page.locator('.plateau-card')).toContainText('--');
  await page.getByLabel('医療',{exact:true}).uncheck();await expect(polygons(page)).toHaveCount(3);await expect(page.locator('.plateau-card')).toBeHidden();
  await page.getByLabel('その他',{exact:true}).check();await expect(polygons(page)).toHaveCount(4);expect(calls()).toBe(1);
  await page.locator('[data-flight="test-ana"]').click();await expect(page.locator('#live-route-type')).toHaveText('ESTIMATED');await page.locator('#live-preview').click();await expect(page.locator('#live-view-mode')).toHaveText('PREVIEW');await expect(polygons(page)).toHaveCount(4);
  await page.locator('#data-demo').click();await expect(page.locator('.route-card')).toHaveCount(4);await expect(polygons(page)).toHaveCount(4);await expect(page.locator('#play-pause-btn')).toBeEnabled();
  await page.locator('#plateau-toggle').click();await expect(polygons(page)).toHaveCount(0);await expect(page.locator('#plateau-insight-panel')).toBeHidden();
  await page.locator('#plateau-toggle').click();await expect(polygons(page)).toHaveCount(4);expect(calls()).toBe(1);
});

test('OFF during a pending fetch never mounts stale polygons; enabling again reuses the request',async({page})=>{
  let release;const gate=new Promise(r=>release=r);let calls=0;
  await page.route('**/data/plateau/haneda-buildings.geojson',async route=>{calls++;await gate;await route.fulfill({json:collection});});
  await setup(page);await page.locator('#plateau-toggle').click();await expect.poll(()=>calls).toBe(1);await page.locator('#plateau-toggle').click();release();await page.waitForTimeout(100);await expect(polygons(page)).toHaveCount(0);
  await page.locator('#plateau-toggle').click();await expect(polygons(page)).toHaveCount(4);expect(calls).toBe(1);
});

test('unavailable PLATEAU leaves LIVE and DEMO working and allows retry',async({page})=>{
  await page.route('**/data/plateau/haneda-buildings.geojson',r=>r.fulfill({status:404,body:'missing'}));await setup(page);
  await page.locator('#plateau-toggle').click();await expect(page.locator('.plateau-status')).toHaveText('PLATEAU data unavailable');await expect(polygons(page)).toHaveCount(0);
  await page.locator('[data-flight="test-ana"]').click();await expect(page.locator('#live-route-type')).toHaveText('ESTIMATED');await page.locator('#data-demo').click();await expect(page.locator('.route-card')).toHaveCount(4);
  await mockData(page);await page.locator('#plateau-toggle').click();await page.locator('#plateau-toggle').click();await expect(polygons(page)).toHaveCount(4);
});

test('rendering obeys building cap and clears a batch when switched off',async({page})=>{
  await mockData(page,{type:'FeatureCollection',features:Array.from({length:500},(_,i)=>make('limit-'+i,'PUBLIC_TRANSPORT'))});await setup(page);
  await page.locator('#plateau-toggle').click();await expect(polygons(page)).toHaveCount(400);await expect(page.locator('.plateau-status')).toContainText('400 / 500');
  await page.locator('#plateau-toggle').click();await expect(polygons(page)).toHaveCount(0);
  await page.locator('#plateau-toggle').click();await page.locator('#plateau-toggle').click();await page.waitForTimeout(150);await expect(polygons(page)).toHaveCount(0);
});

for(const mobile of [false,true])test('PLATEAU layout avoids camera, flight info and playback on '+(mobile?'mobile':'desktop'),async({page})=>{
  await page.setViewportSize(mobile?{width:390,height:844}:{width:1366,height:900});await mockData(page);await setup(page);
  if(mobile)await page.locator('#mobile-departures-btn').click();await page.locator('[data-flight="test-ana"]').click();await expect(page.locator('#live-route-type')).toHaveText('ESTIMATED');
  await page.locator('#plateau-toggle').click();await expect(polygons(page)).toHaveCount(4);await page.locator('[data-plateau-id="test-public"]').first().dispatchEvent('gmp-click');
  const panel=await page.locator('#plateau-insight-panel').boundingBox(),controls=await page.locator('#map-controls-container').boundingBox(),playback=await page.locator('#playback-container').boundingBox(),info=await page.locator('#flight-info-root').boundingBox();
  expect(panel.y).toBeGreaterThanOrEqual(controls.y+controls.height);expect(panel.y+panel.height).toBeLessThanOrEqual(playback.y);
  if(mobile){expect(panel.y+panel.height).toBeLessThanOrEqual(info.y);expect(panel.x+panel.width).toBeLessThanOrEqual(390);}else expect(panel.x).toBeGreaterThanOrEqual(info.x+info.width);
  await expect(page.getByText('Source: Project PLATEAU / MLIT')).toBeVisible();
  await page.screenshot({path:'tests/plateau-'+(mobile?'mobile':'desktop')+'.png'});
});

test('first visit shows PLATEAU automatically and remembers explicit OFF across reloads',async({page})=>{
  await mockData(page);await setup(page,{plateauDefault:true});
  await expect(polygons(page)).toHaveCount(4);
  await expect(page.locator('#plateau-toggle')).toHaveText('PLATEAU ON');
  await page.locator('#plateau-toggle').click();await expect(polygons(page)).toHaveCount(0);
  await expect(page.locator('#plateau-toggle')).toHaveText('PLATEAU OFF');
  await page.reload();await expect(page.locator('#plateau-toggle')).toHaveAttribute('aria-pressed','false');
  await expect(polygons(page)).toHaveCount(0);
  await page.locator('#plateau-toggle').click();await expect(polygons(page)).toHaveCount(4);
  await page.reload();await expect(polygons(page)).toHaveCount(4);
});
