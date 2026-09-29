import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire('/home/rafaelejosi/piano-api/package.json');
const WebSocket = require('ws');
const root = new URL('../', import.meta.url);

// WT-5d: webOS e Tizen usam o MESMO arquivo — paridade obrigatória.
const webos = await readFile(new URL('webos/index.html', root), 'utf8');
const tizen = await readFile(new URL('tizen/index.html', root), 'utf8');
assert.equal(webos, tizen, 'webos/index.html e tizen/index.html divergiram');

for (const [name, html] of [['webos', webos], ['tizen', tizen]]) {
  assert.match(html, /cloudConnect/, `${name}: cloudConnect ausente`);
  assert.match(html, /role=receiver/, `${name}: role=receiver ausente`);
  assert.match(html, /\/sessions\/'\s*\+\s*code\s*\+\s*'\/token/, `${name}: fetch token ausente`);
  assert.match(html, /palcoCloudCode/, `${name}: persistência do código ausente`);
  assert.match(html, /\[A-Za-z0-9\]\{6\}/, `${name}: validação de código de 6 chars ausente`);
  // caminho local intacto (scan do sender)
  assert.match(html, /scanSubnet/, `${name}: fluxo local (scan) deve continuar presente`);
  assert.match(html, /stopMediaOnServerLoss/, `${name}: guard de mídia ausente`);
}

const port = 3198;
const api = `http://127.0.0.1:${port}`;
const child = spawn('node', ['dist/index.js'], {
  cwd: '/home/rafaelejosi/piano-api',
  env: { ...process.env, PORT: String(port), DB_PATH: './data/wt5d-smoke.db', REMOTE_SESSION_KEY: 'test-key', PALCO_RELAY_KEY: 'test-key' },
  stdio: 'ignore',
});

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
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
  // Simula o fluxo que a TV executa: POST /sessions cria o código do operador;
  // TV (webos/tizen cloud mode) faz GET /token e conecta role=receiver.
  const session = await fetch(`${api}/v1/palco/sessions`, { method: 'POST' }).then((r) => r.json());
  const tokenRes = await fetch(`${api}/v1/palco/sessions/${session.code}/token`);
  assert.equal(tokenRes.ok, true, 'endpoint de token deve responder');
  const { token } = await tokenRes.json();

  const receiver = await open(`${api.replace('http', 'ws')}/v1/palco/relay/${session.code}?token=${token}&role=receiver`);
  const operator = await open(`${api.replace('http', 'ws')}/v1/palco/relay/${session.code}?token=${session.token}&role=operator`);
  const received = new Promise((resolve) => receiver.once('message', (raw) => resolve(JSON.parse(String(raw)))));
  operator.send(JSON.stringify({ v: 2, type: 'projection', text: 'WT-5d TV', footerRef: 'Sl 23' }));
  const msg = await received;
  assert.equal(msg.type, 'projection');
  assert.equal(msg.text, 'WT-5d TV');
  operator.close(); receiver.close();
  console.log('WT-5d smoke PASS (webos+tizen paridade + fluxo relay real)');
} finally {
  child.kill();
}
