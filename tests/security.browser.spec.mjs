import { test, expect } from '@playwright/test';

test('HTML rendering removes executable markup while preserving UI controls and SVG', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { setSafeHtml } = await import('/src/utils/safeHtml.ts');
    const root = document.createElement('div');
    document.body.append(root);
    window.__xss = 0;
    setSafeHtml(root, `<script>window.__xss=1</script><img src="/missing" onerror="window.__xss=2">
      <a href="javascript:window.__xss=3">bad URL</a><iframe srcdoc="<script>parent.__xss=4</script>"></iframe>
      <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21"/><foreignObject><div onmouseover="window.__xss=5">bad</div></foreignObject></svg>
      <input id="seek-slider" type="range" value="25" aria-label="Progress">
      <button id="live-preview" data-flight="ANA53">Preview</button><br><code>.env.local</code>`);
    const button = root.querySelector('#live-preview');
    let clicked = false;
    button.addEventListener('click', () => { clicked = true; });
    button.click();
    return {
      scripts: root.querySelectorAll('script, iframe, foreignObject').length,
      handlers: [...root.querySelectorAll('*')].flatMap(el => [...el.attributes]).filter(a => /^on/i.test(a.name)).length,
      href: root.querySelector('a').getAttribute('href'),
      svg: !!root.querySelector('svg polygon'),
      range: root.querySelector('#seek-slider').value,
      aria: root.querySelector('#seek-slider').getAttribute('aria-label'),
      flight: button.dataset.flight, clicked, executed: window.__xss,
      code: root.querySelector('code').textContent,
    };
  });
  expect(result).toEqual({ scripts: 0, handlers: 0, href: null, svg: true, range: '25', aria: 'Progress', flight: 'ANA53', clicked: true, executed: 0, code: '.env.local' });
});

test('error and departure data cannot inject markup; route selection still works', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { ErrorOverlay } = await import('/src/ui/ErrorOverlay.ts');
    const { FlightPanel } = await import('/src/ui/FlightPanel.ts');
    const attack = '<img src=x onerror="window.__xss=1">';
    window.__xss = 0;
    new ErrorOverlay().showError({ type: 'GENERIC_ERROR', title: attack, message: attack, remedy: '<code>safe</code><script>window.__xss=2</script>' });
    const root = document.createElement('div'); root.id = 'security-departures'; document.body.append(root);
    const panel = new FlightPanel(root);
    panel.onSelect(id => { window.__selectedRoute = id; });
    panel.setDepartures([{ id: '\" onclick=\"window.__xss=3', flightNumber: attack, status: 'ON TIME', destinationCode: 'ITM', destinationName: attack, scheduledTime: '09:30', gate: attack, aircraftType: attack }], '');
  });
  const card = page.locator('#security-departures .route-card');
  await expect(card.locator('.flight-number')).toHaveText('<img src=x onerror="window.__xss=1">');
  await expect(card.locator('img')).toHaveCount(0);
  await card.click();
  expect(await page.evaluate(() => window.__selectedRoute)).toBe('\" onclick=\"window.__xss=3');
  expect(await page.evaluate(() => window.__xss)).toBe(0);
  await expect(page.locator('.error-overlay').last().locator('script, [onclick], [onerror]')).toHaveCount(0);
  await expect(page.locator('.error-overlay').last().locator('.error-remedy-box code')).toHaveText('safe');
});
