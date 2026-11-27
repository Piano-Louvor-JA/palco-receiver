import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const html = await readFile(new URL('../webos/index.html', import.meta.url), 'utf8')
const code = html.slice(html.indexOf('// ===== Auto-descoberta'), html.indexOf('// ===== QRCode minimal'))

function receiver({ query = '', fetch = () => Promise.reject(Error('offline')), native = false } = {}) {
  const messages = [], diagnostics = [], sockets = [], timers = new Map()
  let timerId = 0
  const context = vm.createContext({
    PALCO_I18N: { t: k => k, fmt: (k, vars) => { let s = k; if (vars) for (const v of Object.keys(vars)) s = s.split('{' + v + '}').join(String(vars[v])); return s } },
    URLSearchParams, AbortController, fetch,
    qs: new URLSearchParams(query), cloudMode: false, ws: null, tries: 0,
    location: { hostname: '', protocol: 'file:' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: Object.assign({ addEventListener() {} }, native ? { PalcoNetwork: { postMessage: x => messages.push(JSON.parse(x)) },
      __PALCO_NATIVE_SESSION: 'test-session', __PALCO_NETWORK_READY: true } : {}),
    // vigia do heartbeat (conexão viva) roda no mesmo trecho
    document: { hidden: false, addEventListener() {} }, setInterval: () => 0,
    palcoDiag: (kind, value) => diagnostics.push([kind, value]),
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id },
    clearTimeout: id => timers.delete(id),
    dlog() {}, setStatus() {}, stopMediaOnServerLoss() {}, showIdle() {}, sendHello() {},
    handle() {},
    WebSocket: function (url) {
      this.url = url; this.readyState = 0; this.close = () => { this.readyState = 3 }
      sockets.push(this)
    },
    PALCO_I18N: { t: (k, vars) => { let s = k; if (vars) for (const v of Object.keys(vars)) s = s.split('{' + v + '}').join(String(vars[v])); return s }, fmt: (k, vars) => k },
  })
  vm.runInContext(code + '\nglobalThis.state=()=>({host,port,palcoScanGeneration});', context)
  const run = script => vm.runInContext(script, context)
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
  return { context, run, messages, diagnostics, sockets, timers, flush }
}

test('native status bypasses browser fetch; correlates replies and retains unlocked=false', async () => {
  const r = receiver({ native: true, fetch: () => { throw Error('must not fetch') } })
  const pending = r.context.probeHttp('192.168.18.12', 47080)
  const request = r.messages[0]
  assert.equal(request.op, 'status')
  r.context.window.__palcoStatusResult('old-page', request.id, { kind: 'ok', unlocked: true })
  assert.equal(r.timers.size, 1)
  r.context.window.__palcoStatusResult('test-session', request.id, { kind: 'ok', unlocked: false })
  assert.equal((await pending).unlocked, false)
  assert.equal(r.timers.size, 0)
})

test('hanging HTTP has a deadline and aborts instead of blocking a batch forever', async () => {
  let signal
  const r = receiver({ fetch: (_, init) => { signal = init.signal; return new Promise(() => {}) } })
  const pending = r.context.probeHttp('192.168.18.12', 47080)
  for (const timer of [...r.timers.values()]) timer.fn()
  assert.equal(await pending, null)
  assert.equal(signal.aborted, true)
  assert.equal(r.diagnostics[0][0], 'http_timeout')
})

test('bridge failure is bounded and cancelled; reports native failure category', async () => {
  const r = receiver({ native: true })
  const pending = r.context.probeHttp('192.168.18.12', 47080)
  r.context.window.__palcoStatusResult('test-session', r.messages[0].id, { kind: 'http_status', status: 503 })
  assert.equal(await pending, null)
  assert.equal(r.diagnostics[0][0], 'native_http_status')
  assert.equal(r.messages.at(-1).op, 'cancel')
})

test('HTTP status at p+1 maps to WS p+2, never to the HTTP port itself', async () => {
  const r = receiver({ fetch: url => url.includes(':47082/')
    ? Promise.resolve({ json: async () => ({ unlocked: true }) }) : Promise.reject(Error()) })
  assert.equal(await r.context.probePair('192.168.18.12', 47081), 47083)
})

test('parallel discovery commits the port belonging to the chosen host', async () => {
  const r = receiver({ fetch: url => {
    const u = new URL(url)
    const ok = (u.hostname === '192.168.18.1' && u.port === '7080') ||
      (u.hostname === '192.168.18.2' && u.port === '47080')
    return ok ? Promise.resolve({ json: async () => ({ unlocked: true }) }) : Promise.reject(Error())
  } })
  r.context.window.__PALCO_LOCAL_IP = '192.168.18.20'
  assert.equal(await r.context.scanSubnet(), '192.168.18.1')
  assert.equal(r.context.state().port, '7081')
})

test('obsolete native discovery cannot mutate host or port, nor start more requests', async () => {
  const r = receiver({ native: true })
  const pending = r.context.probeSender('192.168.18.12')
  r.run('++palcoScanGeneration; port="52001"; cancelStatusProbes();')
  const count = r.messages.length
  assert.equal(await pending, null)
  assert.equal(r.messages.length, count)
  assert.equal(r.context.state().port, '52001')
})

test('manual host wins over Flutter hint; relay never starts local discovery', async () => {
  const r = receiver({ query: 'host=192.168.18.12&port=52001', native: true })
  r.context.window.__PALCO_LOCAL_IP = '192.168.18.20'
  r.context.window.__palcoLocalIpReady()
  assert.equal(r.sockets[0].url, 'ws://192.168.18.12:52001/palco')
  assert.equal(r.messages.length, 0)
  r.run('cloudMode=true; ++palcoScanGeneration;')
  r.context.connect()
  r.context.window.__palcoLocalIpReady()
  assert.equal(r.sockets.length, 1)
})

test('late socket open and retry cannot steal a newer connection or relay', async () => {
  const r = receiver({ query: 'host=192.168.18.12' })
  r.context.connect()
  const old = r.sockets[0], oldOpen = old.onopen
  r.run('port="52001"; doConnect();')
  oldOpen()
  assert.equal(old.readyState, 3)
  assert.equal(r.sockets.length, 2)
  r.context.retry()
  r.run('cloudMode=true; ++palcoScanGeneration;')
  for (const timer of [...r.timers.values()]) timer.fn()
  assert.equal(r.sockets.length, 2)
})

test('native initialization waits for IP before scanning a guessed subnet', () => {
  const r = receiver({ native: true })
  r.context.window.__PALCO_NETWORK_READY = false
  r.context.connect()
  assert.equal(r.messages.length, 0)
})

test('relay uses browser HTTPS independently, cancels LAN and ignores late token after manual choice', async () => {
  let reply
  const urls = []
  const r = receiver({ native: true, query: 'api=wss://relay.example/v1/palco',
    fetch: url => { urls.push(url); return new Promise(resolve => { reply = resolve }) } })
  const pending = r.context.probeSender('192.168.18.12')
  r.context.cloudConnect('ABC123')
  assert.equal(await pending, null)
  assert.equal(urls[0], 'https://relay.example/v1/palco/sessions/ABC123/token')
  r.run('cloudMode=false; manualHost=true; host="192.168.18.12"; doConnect();')
  reply({ ok: true, json: async () => ({ token: 'test-only' }) })
  await r.flush()
  assert.equal(r.sockets.length, 1)
  // Sem porta no link, a padrão é a do Palco do desktop (47181), não a Transmissão.
  assert.equal(r.sockets[0].url, 'ws://192.168.18.12:47181/palco')
})

test('local websocket close schedules exactly one bounded retry and preserves manual host', () => {
  const r = receiver({ query: 'host=192.168.18.12&port=52001' })
  r.context.connect()
  r.sockets[0].onclose({ code: 1006 })
  assert.equal(r.timers.size, 1)
  assert.equal([...r.timers.values()][0].ms, 1000)
  const timer = [...r.timers.values()][0]
  timer.fn()
  assert.equal(r.sockets.length, 2)
  assert.equal(r.context.state().host, '192.168.18.12')
})

test('every inline script parses and contains no optional chaining/nullish operators', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  assert.ok(scripts.length > 3)
  for (const [, script] of scripts) {
    assert.doesNotMatch(script, /\?\?|\?\.[a-zA-Z]/)
    new vm.Script(script)
  }
})
