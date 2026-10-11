import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const compiled = await build({ stdin: { contents: "export * from './src/utils/safeHtml'; export * from './src/ui/ErrorOverlay'; export * from './src/ui/FlightPanel'; export * from './src/ui/PlaybackControls';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' } });
const { setSafeHtml, ErrorOverlay, FlightPanel, PlaybackControls } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('sanitized fragments remove scripts, event handlers and unsafe URLs, preserve SVG and controls', () => {
  const root = document.createElement('div');
  setSafeHtml(root, `<script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">link</a>
    <iframe srcdoc="<script>alert(4)</script>"></iframe><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21"/><foreignObject><div>bad</div></foreignObject><animate attributeName="href" values="javascript:alert(5)"/></svg>
    <input id="seek-slider" type="range" value="25" aria-label="Progress"><button id="live-preview" data-flight="ANA53">Preview</button><code>.env.local</code>`);
  assert.equal(root.querySelectorAll('script, iframe, foreignObject, animate').length, 0);
  assert.ok([...root.querySelectorAll('*')].every(el => [...el.attributes].every(a => !/^on/i.test(a.name))));
  assert.equal(root.querySelector('a').getAttribute('href'), null);
  assert.ok(root.querySelector('svg polygon'));
  assert.equal(root.querySelector('#seek-slider').value, '25');
  assert.equal(root.querySelector('#seek-slider').getAttribute('aria-label'), 'Progress');
  const button = root.querySelector('#live-preview');
  assert.equal(button.dataset.flight, 'ANA53');
  let clicked = false; button.addEventListener('click', () => { clicked = true; }); button.click();
  assert.ok(clicked);
  assert.equal(root.querySelector('code').textContent, '.env.local');
});

test('errors safely handle HTML and model URLs while preserving remedy formatting and reload binding', () => {
  new ErrorOverlay().showError({ type: 'GENERIC_ERROR', title: '<img src=x onerror="alert(1)">', message: '<img src=x onerror="alert(2)">', remedy: '<code>.env.local</code><br><script>alert(3)</script>' });
  let overlay = document.querySelector('.error-overlay');
  assert.equal(overlay.querySelector('.error-title').textContent, '<img src=x onerror="alert(1)">');
  assert.equal(overlay.querySelectorAll('script, [onerror], [onclick]').length, 0);
  assert.equal(overlay.querySelector('code').textContent, '.env.local');
  assert.ok(overlay.querySelector('br'));
  ErrorOverlay.showGLBError('</code><img src=x onerror="alert(1)">');
  overlay = [...document.querySelectorAll('.error-overlay')].at(-1);
  assert.equal(overlay.querySelectorAll('img').length, 0);
  assert.match(overlay.querySelector('.error-message').textContent, /<img src=x/);
});

test('departure fields remain text and malicious route IDs round-trip through selection', () => {
  const root = document.createElement('div');
  const panel = new FlightPanel(root);
  const attack = '<img src=x onerror="alert(1)">';
  const id = '\" onclick=\"alert(2)';
  let selected; panel.onSelect(value => { selected = value; });
  panel.setDepartures([{ id, flightNumber: attack, status: 'ON TIME', destinationCode: 'ITM', destinationName: attack, scheduledTime: '09:30', gate: attack, aircraftType: attack }], '');
  const card = root.querySelector('.route-card');
  assert.equal(card.querySelector('.flight-number').textContent, attack);
  assert.equal(card.querySelectorAll('img, [onclick], [onerror]').length, 0);
  card.click(); assert.equal(selected, id); assert.ok(card.classList.contains('active'));
});

test('playback controls keep SVG and event bindings after sanitized rendering', () => {
  const root = document.createElement('div');
  let played = false;
  const controls = new PlaybackControls(root, { onTogglePlay: () => { played = true; }, onToggleReverse() {}, onRestart() {}, onSpeedChange() {}, onSeek() {} });
  assert.ok(root.querySelector('#seek-slider'));
  assert.ok(root.querySelector('#play-pause-btn svg polygon'));
  root.querySelector('#play-pause-btn').click();
  assert.ok(played);
  controls.setPlayingState(true);
  assert.equal(root.querySelectorAll('#play-pause-btn svg rect').length, 2);
  controls.setPlayingState(false);
  assert.ok(root.querySelector('#play-pause-btn svg polygon'));
});

test('Docker health command respects PORT and reports unhealthy responses and connection failures', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createServer } = await import('node:http');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { createApp } = await import('../server/index.mjs');
  const dockerfile = await readFile('Dockerfile', 'utf8');
  const command = dockerfile.match(/CMD node -e "([^"]+)"/)[1];
  const run = port => promisify(execFile)(process.execPath, ['-e', command], { env: { ...process.env, PORT: String(port) }, timeout: 5000 });
  const app = createApp();
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  try { await run(app.address().port); } finally { await new Promise(resolve => app.close(resolve)); }
  const bad = createServer((_req, res) => { res.writeHead(503); res.end(); });
  await new Promise(resolve => bad.listen(0, '127.0.0.1', resolve));
  const port = bad.address().port;
  try { await assert.rejects(run(port), error => error.code === 1); } finally { await new Promise(resolve => bad.close(resolve)); }
  await assert.rejects(run(port), error => error.code === 1);
});
