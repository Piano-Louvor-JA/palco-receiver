// Conexão viva dos dois lados: a TV responde o `beat` do computador e, se
// ficar 30 s sem ouvir nada dele, fecha e reconecta sozinha.
// node:test puro — executa os trechos reais do receiver num contexto isolado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const html = await readFile(new URL('../webos/index.html', import.meta.url), 'utf8')

function slice(startMarker, endMarker) {
  const start = html.indexOf(startMarker)
  const end = html.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start, `trecho não encontrado: ${startMarker}`)
  return html.slice(start, end)
}

function receiver() {
  const sockets = []
  const calls = { connect: 0, handled: [], idle: 0, listeners: {} }
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; this.closed = false; sockets.push(this) }
    send(data) { this.sent.push(data) }
    close() { this.closed = true; this.readyState = 3 }
  }
  const context = vm.createContext({
    PALCO_I18N: { t: k => k, fmt: (k, vars) => { let s = k; if (vars) for (const v of Object.keys(vars)) s = s.split('{' + v + '}').join(String(vars[v])); return s } },
    WebSocket: FakeSocket,
    localStorage: { setItem() {}, removeItem() {}, getItem: () => null },
    window: { addEventListener: (name, fn) => { calls.listeners[name] = fn } },
    document: { hidden: false, addEventListener: (name, fn) => { calls.listeners[name] = fn } },
    setInterval: () => 0,
    setTimeout: () => 1,
    clearTimeout: () => {},
    host: '192.168.0.130', port: '47181', tries: 0, ws: null, cloudMode: false,
    // estado da conexão local (descoberta da #43)
    palcoScanGeneration: 0, localRetryTimer: null, manualHost: false,
    cancelStatusProbes: () => {}, statusDiagnostic: () => {}, palcoDiag: () => {},
    dlog: () => {}, setStatus: () => {}, sendHello: () => {},
    stopMediaOnServerLoss: () => {}, showIdle: () => { calls.idle += 1 },
    handle: (m) => calls.handled.push(m),
    connect: () => { calls.connect += 1 },
    PALCO_I18N: { t: (k, vars) => { let s = k; if (vars) for (const v of Object.keys(vars)) s = s.split('{' + v + '}').join(String(vars[v])); return s }, fmt: (k, vars) => k },
  })
  vm.runInContext(
    slice('function doConnect(){', '// ===== WT-5d') +
      ';globalThis.__ws=()=>ws;globalThis.__set=(k,v)=>{if(k==="cloud")cloudMode=v};',
    context,
  )
  return { context, sockets, calls }
}

test('o hello da TV avisa que entende o heartbeat', () => {
  assert.match(slice('function sendHello(){', 'sendEvent(msg)'), /caps:\['frameView','heartbeat'\]/)
})

test('responde o beat do computador sem mandar nada para a tela', () => {
  const { context, sockets, calls } = receiver()
  context.doConnect()
  const ws = sockets[0]
  ws.onopen()
  ws.onmessage({ data: '{"v":2,"type":"beat"}' })
  assert.equal(JSON.stringify(ws.sent), JSON.stringify(['{"v":2,"type":"beat"}']))
  assert.equal(calls.handled.length, 0)
  ws.onmessage({ data: '{"v":2,"type":"idle"}' })
  assert.equal(JSON.stringify(calls.handled), '[{"v":2,"type":"idle"}]')
})

test('computador calado por 30 s: fecha a conexão pendurada e reconecta', () => {
  const { context, sockets, calls } = receiver()
  context.doConnect()
  const ws = sockets[0]
  ws.onopen()
  ws.onmessage({ data: '{"v":2,"type":"beat"}' })
  const heard = Date.now()
  assert.equal(context.checkServerAlive(heard + 20000), false)
  assert.equal(context.checkServerAlive(heard + 31000), true)
  assert.equal(ws.closed, true)
  assert.equal(ws.onclose, null, 'a conexão velha não agenda outra tentativa')
  assert.equal(calls.connect, 1)
  assert.equal(context.__ws(), null)
})

test('computador antigo (sem beat) ou relay cloud: o vigia fica desligado', () => {
  const old = receiver()
  old.context.doConnect()
  old.sockets[0].onopen()
  assert.equal(old.context.checkServerAlive(Date.now() + 60 * 60000), false)
  assert.equal(old.calls.connect, 0)

  const cloud = receiver()
  cloud.context.doConnect()
  cloud.sockets[0].onopen()
  cloud.sockets[0].onmessage({ data: '{"v":2,"type":"beat"}' })
  cloud.context.__set('cloud', true)
  assert.equal(cloud.context.checkServerAlive(Date.now() + 60 * 60000), false)
})

test('rede voltou ou o app voltou à frente: reconecta na hora se estava esperando', () => {
  const { context, calls } = receiver()
  context.retry()
  calls.listeners.online()
  assert.equal(calls.connect, 1)
  // sem tentativa pendente (já conectado ou procurando), não abre outra
  calls.listeners.visibilitychange()
  assert.equal(calls.connect, 1)
})
