// Teclas do controle remoto em todas as TVs (webOS, Tizen, Android TV) e a
// entrada manual de IP/código. node:test puro — executa os trechos reais do
// receiver num contexto isolado com DOM mínimo falso.
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

function el() {
  return { style: {}, innerHTML: '', textContent: '', remove() { this.removed = true } }
}

function receiver({ idle = true, tizen = null } = {}) {
  const listeners = []
  const store = new Map()
  const calls = []
  const ipVal = el()
  const doc = {
    body: { appendChild() {} },
    createElement: () => el(),
    getElementById: (id) => {
      if (id === 'idle') return { classList: { contains: (c) => c === 'hidden' && !idle } }
      if (id === 'ipVal') return ipVal
      return null
    },
  }
  const win = {
    addEventListener: (type, fn) => { if (type === 'keydown') listeners.push(fn) },
  }
  if (tizen) win.tizen = tizen
  const context = vm.createContext({
    window: win,
    document: doc,
    location: { reload: () => calls.push('reload') },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    ws: null, tries: 0, host: '', port: '47081',
    doConnect: () => calls.push('doConnect'),
    cloudConnect: (c) => calls.push('cloud:' + c),
    cloudCreate: () => calls.push('cloudCreate'),
    scanSubnet: () => calls.push('scan'),
    setStatus: () => {},
    $: () => ({ pause() {}, removeAttribute() {}, load() {}, style: {} }),
    hideNp: () => {},
    showIdle: () => calls.push('idle'),
  })
  const code = [
    slice('// ===== Teclas do controle', '// ===== F3.3u'),
    slice('// ===== F3.3u', "document.addEventListener('pointerdown'"),
    ';globalThis.__st=()=>({host,port,open:!!ipEntry,val:ipEntry?ipEntry._val:null});',
  ].join('\n')
  vm.runInContext(code, context)
  const press = (keyCode, key = '') => {
    const ev = { keyCode, key, preventDefault() {}, stopPropagation() {} }
    for (const fn of listeners) fn(ev)
  }
  return { context, press, calls, store, state: () => context.__st() }
}

// Android TV (WebView) entrega as coloridas com keyCode 0 e o nome em e.key.
const ANDROID_RED = [0, 'ColorF0Red']
const ANDROID_YELLOW = [0, 'ColorF2Yellow']
const ANDROID_BLUE = [0, 'ColorF3Blue']

test('remoteColor reconhece keyCode (webOS/Tizen) e e.key (Android TV)', () => {
  const { context } = receiver()
  assert.equal(context.remoteColor({ keyCode: 403, key: '' }), 'red')
  assert.equal(context.remoteColor({ keyCode: 0, key: 'ColorF0Red' }), 'red')
  assert.equal(context.remoteColor({ keyCode: 404, key: '' }), 'green')
  assert.equal(context.remoteColor({ keyCode: 0, key: 'ColorF1Green' }), 'green')
  assert.equal(context.remoteColor({ keyCode: 405, key: '' }), 'yellow')
  assert.equal(context.remoteColor({ keyCode: 0, key: 'ColorF3Blue' }), 'blue')
  assert.equal(context.remoteColor({ keyCode: 13, key: 'Enter' }), '')
})

test('vermelha do Android TV abre e fecha a entrada de IP', () => {
  const r = receiver()
  r.press(...ANDROID_RED)
  assert.equal(r.state().open, true)
  r.press(...ANDROID_RED)
  assert.equal(r.state().open, false)
})

test('vermelha do webOS/Tizen (403) continua abrindo a entrada', () => {
  const r = receiver()
  r.press(403)
  assert.equal(r.state().open, true)
})

test('"0" no idle abre a entrada de IP (controle sem tecla colorida)', () => {
  const r = receiver()
  r.press(48, '0')
  assert.equal(r.state().open, true)
  assert.equal(r.state().val, '', 'o 0 que abriu não entra no campo')
})

test('"0" fora do idle não abre a entrada', () => {
  const r = receiver({ idle: false })
  r.press(48, '0')
  assert.equal(r.state().open, false)
})

test('IP:PORTA pelo controle: amarela digita ":" e conecta no IP e porta', () => {
  const r = receiver()
  r.press(403)
  for (const ch of '192.168.0.130') r.press(ch === '.' ? 190 : 48 + Number(ch), ch)
  r.press(...ANDROID_YELLOW)
  for (const ch of '47083') r.press(48 + Number(ch), ch)
  assert.equal(r.state().val, '192.168.0.130:47083')
  r.press(13, 'Enter')
  assert.equal(r.state().open, false)
  assert.equal(r.state().host, '192.168.0.130')
  assert.equal(r.state().port, '47083')
  assert.equal(r.store.get('palcoHost'), '192.168.0.130')
  assert.equal(r.store.get('palcoPort'), '47083')
  assert.ok(r.calls.includes('doConnect'))
})

test('":" de teclado físico também entra no campo', () => {
  const r = receiver()
  r.press(403)
  r.press(186, ':')
  assert.equal(r.state().val, ':')
})

test('campo aceita IP:PORTA completo (21 caracteres) e para aí', () => {
  const r = receiver()
  r.press(403)
  const full = '192.168.100.200:47081'
  for (const ch of full) {
    if (ch === '.') r.press(190, '.')
    else if (ch === ':') r.press(405)
    else r.press(48 + Number(ch), ch)
  }
  assert.equal(r.state().val, full)
  r.press(49, '1')
  assert.equal(r.state().val, full)
})

test('azul do Android TV recarrega o palco', () => {
  const r = receiver()
  r.press(...ANDROID_BLUE)
  assert.deepEqual(r.calls, ['reload'])
})

test('Tizen: registra coloridas, dígitos e mídia (sem isso a TV não entrega)', () => {
  const reg = []
  receiver({ tizen: { tvinputdevice: { registerKey: (n) => reg.push(n) } } })
  for (const n of ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', '0', '9', 'MediaPlayPause', 'MediaStop']) {
    assert.ok(reg.includes(n), `registerKey('${n}') faltando`)
  }
})

test('Tizen: tecla que a TV não suporta não impede registrar as outras', () => {
  const reg = []
  receiver({
    tizen: {
      tvinputdevice: {
        registerKey: (n) => { if (n === 'ColorF2Yellow') throw new Error('not supported'); reg.push(n) },
      },
    },
  })
  assert.ok(reg.includes('ColorF3Blue'))
  assert.ok(reg.includes('MediaStop'))
})
