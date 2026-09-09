import { test, expect } from '@playwright/test';
import { setup } from './helpers/phase2-browser.mjs';
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
