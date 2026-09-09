import {chromium} from '@playwright/test';
const url=process.env.SKYROUTE_PRODUCTION_URL;
if(!url)throw new Error('Set SKYROUTE_PRODUCTION_URL explicitly; this check uses live APIs.');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const mapErrors=[];page.on('console',m=>{if(m.type()==='error'&&/Google Maps|ApiNotActivated|RefererNotAllowed|InvalidKey/.test(m.text()))mapErrors.push(m.text().replace(/AIza[\w-]+/g,'[redacted]'));});
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#data-live').waitFor({timeout:60000});
  await page.locator('.live-routes .route-card').first().waitFor({timeout:30000});
  await page.waitForTimeout(10000);
  console.log(JSON.stringify({title:await page.title(),cards:await page.locator('.live-routes .route-card').count(),source:await page.locator('#data-source-status').innerText(),mapElements:await page.locator('gmp-map-3d').count(),errors,mapErrors}));
  if(process.env.SKYROUTE_CHECK_PLATEAU==='1') {
    await page.locator('#plateau-toggle').click();
    await page.waitForFunction(()=>document.querySelector('.plateau-status')?.textContent?.includes('棟表示'),{},{timeout:30000});
    const polygons=page.locator('gmp-polygon-3d-interactive');
    if(!await polygons.count())throw new Error('No PLATEAU polygons rendered');
    await polygons.first().dispatchEvent('gmp-click');
    console.log(JSON.stringify({plateauPolygons:await polygons.count(),plateauStatus:await page.locator('.plateau-status').innerText()}));
  }
  await page.screenshot({path:'tests/production-screen.png'});
  if(errors.length||mapErrors.length)process.exitCode=1;
} finally {await browser.close();}
