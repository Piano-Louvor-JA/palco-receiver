// Descoberta do computador/celular que transmite: porta nova 47080/47081 e a
// antiga 7080/7081 (APK e computadores ainda não atualizados).
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

function receiver({ query = '', saved = {}, open = [] } = {}) {
  const store = new Map(Object.entries(saved))
  const asked = []
  const context = vm.createContext({
    URLSearchParams,
    qs: new URLSearchParams(query),
    location: { hostname: '', protocol: 'file:' },
    window: {},
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
cloudMode: false,
dlog: () => {},
fetch: (url) => {
      asked.push(url)
      const { hostname, port, pathname } = new URL(url)
      if (pathname === '/status' && open.includes(`${hostname}:${port}`)) {
        return Promise.resolve({ json: () => Promise.resolve({ unlocked: true }) })
      }
      return Promise.reject(new Error('refused'))
    },
  })
  const code = [
    slice('function proxyUrl(original){', 'function setStatus('),
    slice('// ===== Auto-descoberta', 'async function scanSubnet'),
    slice('async function scanSubnet(){', 'function connect(){'),
    slice('function coverUrl(cover){', 'function showNp('),
    ';globalThis.__state=()=>({host,port});globalThis.__setHost=(h)=>{host=h};',
  ].join('\n')
  vm.runInContext(code, context)
  return { context, asked, state: () => context.__state() }
}

test('sem porta escolhida, a padrão é a nova 47081', () => {
  const { state } = receiver()
  assert.equal(state().port, '47081')
})

test('acha o computador atualizado na porta nova', async () => {
  const r = receiver({ open: ['192.168.1.20:47080'] })
  assert.equal(await r.context.probeSender('192.168.1.20'), '192.168.1.20')
  assert.equal(r.state().port, '47081')
})

test('acha o celular (APK) ou computador antigo na porta 7080', async () => {
  const r = receiver({ open: ['192.168.1.30:7080'] })
  assert.equal(await r.context.probeSender('192.168.1.30'), '192.168.1.30')
  assert.equal(r.state().port, '7081')
})

test('com as duas portas respondendo, prefere a nova', async () => {
  const r = receiver({ open: ['192.168.1.40:7080', '192.168.1.40:47080'] })
  await r.context.probeSender('192.168.1.40')
  assert.equal(r.state().port, '47081')
})

test('porta salva de uma conexão anterior é tentada primeiro, sem perder as outras', async () => {
  const saved = receiver({ saved: { palcoPort: '47083' }, open: ['192.168.1.50:47082'] })
  await saved.context.probeSender('192.168.1.50')
  assert.equal(saved.state().port, '47083')
  const moved = receiver({ saved: { palcoPort: '7081' }, open: ['192.168.1.51:47080'] })
  assert.equal(await moved.context.probeSender('192.168.1.51'), '192.168.1.51')
  assert.equal(moved.state().port, '47081')
})

test('porta definida no link é respeitada, sem tentar outras', async () => {
  const r = receiver({ query: 'port=7083', open: ['192.168.1.60:47080'] })
  assert.equal(await r.context.probeSender('192.168.1.60'), null)
  assert.ok(r.asked.every((url) => /:(7082|7083|7084)\//.test(url)), r.asked.join(' '))
})

test('sem resposta em nenhuma porta, não acha nada', async () => {
  const r = receiver()
  assert.equal(await r.context.probeSender('192.168.1.70'), null)
})

test('mídia remota e capas passam pela porta HTTP de quem transmite', async () => {
  const r = receiver({ open: ['192.168.1.20:47080'] })
  await r.context.probeSender('192.168.1.20')
  r.context.__setHost('192.168.1.20')
  assert.equal(
    r.context.proxyUrl('https://cdn.example/bg.jpg'),
    'http://192.168.1.20:47080/proxy?url=https%3A%2F%2Fcdn.example%2Fbg.jpg',
  )
  assert.equal(r.context.coverUrl('covers/a.jpg'), 'http://192.168.1.20:47080/covers/a.jpg')

  const apk = receiver({ open: ['192.168.1.30:7080'] })
  await apk.context.probeSender('192.168.1.30')
  apk.context.__setHost('192.168.1.30')
  assert.equal(apk.context.coverUrl('covers/a.jpg'), 'http://192.168.1.30:7080/covers/a.jpg')
})

test('a dica de porta manual cita a porta nova', () => {
  assert.match(html, /SÓ A PORTA \(ex\.: 47081\)/)
})

test('Android TV descobre o sender usando o IP local informado pelo Flutter', async () => {
  const r = receiver({
    open: ['192.168.18.12:47080']
  })

  // Simula o IP real da TCL informado pelo Android.
  r.context.window = {
    __PALCO_LOCAL_IP: '192.168.18.20'
  }

  const found = await r.context.scanSubnet()

  assert.equal(found, '192.168.18.12')
  assert.equal(r.state().port, '47081')
})

test('aviso do Flutter inicia descoberta na rede local da TV', async () => {
  const r = receiver({
    open: ['192.168.18.12:47080']
  })

  r.context.ws = null

  let pendingScan = null

  r.context.connect = () => {
    pendingScan = r.context.scanSubnet()
  }

  r.context.window.__PALCO_LOCAL_IP = '192.168.18.20'
  r.context.window.__palcoLocalIpReady()

  assert.ok(pendingScan, 'o aviso deve iniciar uma nova busca')
  assert.equal(await pendingScan, '192.168.18.12')
})