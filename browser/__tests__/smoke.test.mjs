import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire('/home/rafaelejosi/piano-api/package.json');
const WebSocket = require('ws');
const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
const serviceWorker = await readFile(new URL('sw.js', root), 'utf8');

assert.equal(manifest.display, 'fullscreen');
// Instalabilidade Chrome: precisa PNG 192+512 (SVG sozinho não qualifica).
assert.deepEqual(
  [...new Set(manifest.icons.filter((i) => i.type === 'image/png').map((i) => i.sizes))].sort(),
  ['192x192', '512x512'],
);
assert.match(html, /rel="manifest"/);
assert.match(html, /serviceWorker\.register/);
assert.match(html, /getScreenDetails/);
assert.match(html, /logo-piano-louvorja\.png/);
assert.match(html, /params\.get\('code'\)/);
assert.match(html, /louvorja\.palco\.code/);
assert.match(serviceWorker, /addEventListener\('fetch'/);
assert.match(html, /id="code"/);
assert.match(html, /function handle\(m\)/);
assert.match(html, /case "projection"/);
assert.match(html, /case["']timer["']/);
assert.match(html, /\/sessions\/\$\{code\}\/token/);

const port = 3199;
const api = `http://127.0.0.1:${port}`;
const child = spawn('node', ['dist/index.js'], {
  cwd: '/home/rafaelejosi/piano-api',
  env: { ...process.env, PORT: String(port), DB_PATH: './data/wt5-browser-smoke.db', REMOTE_SESSION_KEY: 'test-key', PALCO_RELAY_KEY: 'test-key' },
  stdio: 'ignore',
});

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function ready() {
  for (let n = 0; n < 40; n += 1) {
    try { if ((await fetch(`${api}/v1/health`)).ok) return; } catch {}
    await wait(100);
  }
  throw new Error('API não iniciou');
}
function open(url) {
  const ws = new WebSocket(url);
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}
try {
  await ready();
  const session = await fetch(`${api}/v1/palco/sessions`, { method: 'POST' }).then((r) => r.json());
  const receiverToken = await fetch(`${api}/v1/palco/sessions/${session.code}/token`).then((r) => r.json());
  assert.equal(receiverToken.token, session.token);

  const receiver = await open(`${api.replace('http', 'ws')}/v1/palco/relay/${session.code}?token=${receiverToken.token}&role=receiver`);
  const operator = await open(`${api.replace('http', 'ws')}/v1/palco/relay/${session.code}?token=${session.token}&role=operator`);
  const received = new Promise((resolve) => receiver.once('message', (raw) => resolve(JSON.parse(String(raw)))));
  operator.send(JSON.stringify({ v: 2, type: 'projection', text: 'Teste WT-5b', footerRef: 'Jo 3:16' }));
  assert.deepEqual(await received, { v: 2, type: 'projection', text: 'Teste WT-5b', footerRef: 'Jo 3:16' });
  operator.close(); receiver.close();
  console.log('browser smoke PASS');
} finally {
  child.kill();
}
