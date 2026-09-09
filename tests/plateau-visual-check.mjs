// Opt-in real Google Maps visual check. FlightAware is replaced by local MOCK.
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {createApp} from '../server/index.mjs';
import {createAeroApi} from '../server/aeroApi.mjs';
const api=createApp({api:createAeroApi({mode:'mock',logger:()=>{}})});await new Promise(r=>api.listen(8789,'127.0.0.1',r));
const vite=await createServer({server:{port:5191,strictPort:true,proxy:{'/api':'http://127.0.0.1:8789'}}});await vite.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||m.text().includes('PLATEAU INSIGHT:'))errors.push(m.text().replace(/AIza[\w-]+/g,'[redacted]'));});
  await page.goto('http://localhost:5191/');await page.locator('#plateau-toggle').waitFor({timeout:60000});
  const close=page.getByText('閉じる',{exact:true});if(await close.count())await close.first().click();
  await page.locator('#plateau-toggle').click();await page.waitForFunction(()=>document.querySelector('.plateau-status')?.textContent?.match(/棟表示|unavailable/),{},{timeout:45000});
  await page.waitForTimeout(15000);
  await page.screenshot({path:'tests/plateau-real-map.png'});
  const first=page.locator('gmp-polygon-3d-interactive').first();if(await first.count())await first.dispatchEvent('gmp-click');await page.screenshot({path:'tests/plateau-real-card.png'});
  console.log(JSON.stringify({polygons:await page.locator('gmp-polygon-3d-interactive').count(),status:await page.locator('.plateau-status').innerText(),card:await page.locator('.plateau-card').textContent(),library:await page.evaluate(async()=>{const lib=await google.maps.importLibrary('maps3d');return {polygon:typeof lib.Polygon3DInteractiveElement,altitudeMode:lib.AltitudeMode};}),errors}));
  if(errors.length)process.exitCode=1;
}finally{await browser.close();await vite.close();await new Promise(r=>api.close(r));}