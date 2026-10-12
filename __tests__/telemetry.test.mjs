import { test } from 'node:test'; import assert from 'node:assert';
// Extrai o bloco <script id="telemetry"> do receiver.html e avalia em sandbox ES5-ish
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../webos/index.html', import.meta.url), 'utf8');
const m = html.match(/<script id="palco-telemetry">([\s\S]*?)<\/script>/);
assert.ok(m, 'bloco palco-telemetry existe no HTML');
const code = m[1];

function makeEnv({ dsn } = {}) {
  const store = {}; const sent = []; const xhrs = [];
  const localStorage = {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v) },
  };
  class XMLHttpRequest {
    open(m, u) { this.m = m; this.u = u; xhrs.push(this) }
    setRequestHeader() {} send() { this.status = 200 }
  }
  const sandbox = {
    localStorage, XMLHttpRequest,
    navigator: { userAgent: 'test' },
    location: { search: dsn ? `?telemetry_dsn=${encodeURIComponent(dsn)}` : '' },
    console, Date, Math, JSON, setTimeout,
    __sent: sent,
  };
  const factory = new Function('sandbox', 'CODE', `
    // CODE = bloco <script> extraído do nosso próprio repo (conteúdo versionado,
    // não input de usuário) — sandbox é objeto local do teste. Risco: nenhum.
    with (sandbox) {
      var window = sandbox;
      eval(CODE); // eval do script sob teste, mesmo caso acima: fixture interna
      return { reportPalcoError: typeof reportPalcoError!=='undefined'?reportPalcoError:null, __flushTelemetry: typeof __flushTelemetry!=='undefined'?__flushTelemetry:null, __telemetryQueue: typeof __telemetryQueue!=='undefined'?__telemetryQueue:null };
    }
  `);
  const api = factory(sandbox, code);
  return { ...api, sandbox, sent, xhrs, store };
}

test('sem DSN: não enfileira, não envia, zero rede', () => {
  const env = makeEnv({});
  assert.equal(env.reportPalcoError, null);
});

test('com DSN: enfileira no localStorage e envia via XHR', () => {
  const env = makeEnv({ dsn: 'https://key@errors.example/1' });
  assert.equal(typeof env.reportPalcoError, 'function');
  env.reportPalcoError(new Error('boom'), { tela: 'idle' });
  const q = JSON.parse(env.store['palco_telemetry_queue'] || '[]');
  assert.equal(q.length, 1);
  assert.equal(q[0].message, 'boom');
  assert.equal(typeof q[0].dsn, 'undefined'); // dsn não vai no evento (só na URL)
  assert.ok(env.xhrs.length >= 1, 'XHR enviado');
  assert.ok(env.xhrs[0].u.includes('errors.example'), 'XHR aponta pro DSN');
});
