import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {createApp} from '../server/index.mjs';
import {createAeroApi} from '../server/aeroApi.mjs';
const api=createApp({api:createAeroApi({mode:'mock'})});await new Promise(r=>api.listen(8788,'127.0.0.1',r));
const vite=await createServer({server:{port:5190,strictPort:true,proxy:{'/api':'http://127.0.0.1:8788'}}});await vite.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1366,height:720}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:5190/');
  await page.locator('#data-live').waitFor({timeout:45000}).catch(()=>{});
  const close=page.getByText('\u9589\u3058\u308b',{exact:true});if(await close.count())await close.first().click();
  if(await page.locator('#data-demo').count()) {
    await page.locator('#data-demo').click();
    await page.locator('#seek-slider').fill('30');
    await page.locator('#play-pause-btn').click();
  }
  await page.waitForTimeout(20000);
  console.log((await page.locator('body').innerText()).slice(0,1800));
  console.log('Page errors:',errors);
  await page.screenshot({path:'tests/current-screen.png'});
} finally {await browser.close();await vite.close();await new Promise(r=>api.close(r));}
