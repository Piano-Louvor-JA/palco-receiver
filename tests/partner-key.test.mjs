import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { configureReceiver } from '../scripts/configure-partner-key.mjs'

const targets = ['webos/index.html', 'tizen/index.html', 'androidtv/assets/palco/receiver.html', 'browser/index.html']
const config = { stagingKey: 'plj_palco_stg_teste', productionKey: 'plj_palco_prod_teste', version: '1.2.3' }

async function receiver(target, options = {}) {
  const source = await readFile(new URL('../' + target, import.meta.url), 'utf8')
  const html = configureReceiver(source, { ...config, ...options })
  const script = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))
    .find(match => match[1].includes('PALCO_PARTNER_CONFIG'))?.[1]
  assert.ok(script, 'script de identidade não encontrado')
  const calls = []
  const original = (input, init) => {
    calls.push({ input, init })
    if (options.fail) throw new Error('rede indisponível')
    return Promise.resolve({ ok: true })
  }
  const context = vm.createContext({
    URL, Headers, Request, navigator: { userAgent: options.ua || '' },
    location: { href: 'https://receiver.example/index.html', pathname: '/' },
    window: { fetch: original },
  })
  vm.runInContext(script, context)
  return { context, calls, install: () => vm.runInContext(script, context) }
}

for (const target of targets) {
  test(`${target}: identifica o receiver e seleciona a chave por destino`, async () => {
    const { context, calls } = await receiver(target)
    await context.window.fetch('https://api-stg.pianolouvorja.com.br/v1/palco/sessions', {
      method: 'POST', body: 'conteúdo', headers: { Authorization: 'Bearer sessão' },
    })
    const first = calls[0].init
    assert.equal(first.method, 'POST')
    assert.equal(first.body, 'conteúdo')
    assert.equal(first.headers.get('Authorization'), 'Bearer sessão')
    assert.equal(first.headers.get('X-Partner-Key'), config.stagingKey)
    assert.equal(first.headers.get('X-Client-Platform'), 'palco-browser')
    assert.equal(first.headers.get('X-Client-Version'), config.version)
    await context.window.fetch(new URL('https://api.pianolouvorja.com.br/v1/palco/sessions/ABC123/token'))
    assert.equal(calls[1].init.headers.get('X-Partner-Key'), config.productionKey)
  })
}

for (const [ua, platform] of [['Web0S', 'palco-webos'], ['Tizen', 'palco-tizen'], ['Android', 'palco-androidtv']]) {
  test(`detecta ${platform} no pacote instalado`, async () => {
    const { context, calls } = await receiver(targets[0], { ua })
    await context.window.fetch('https://api-stg.pianolouvorja.com.br/v1/palco/sessions')
    assert.equal(calls[0].init.headers.get('X-Client-Platform'), platform)
  })
}

test('não acrescenta chave a upstream, terceiros, sender local ou caminhos parecidos', async () => {
  const { context, calls } = await receiver(targets[0])
  for (const url of [
    'https://api.louvorja.com.br/v1/palco/sessions',
    'https://googleapis.com/v1/palco/sessions',
    'https://api.pianolouvorja.com.br.example.com/v1/palco/sessions',
    'http://192.168.1.10:7080/status',
    'http://api.pianolouvorja.com.br/v1/palco/sessions',
    'https://api-stg.pianolouvorja.com.br/arquivo?q=/v1/palco',
    'https://api-stg.pianolouvorja.com.br/v1/palco-falso',
  ]) {
    await context.window.fetch(url)
    assert.equal(new Headers(calls.at(-1).init?.headers).has('X-Partner-Key'), false, url)
  }
})

test('API local recebe a chave de staging sem alterar chamadas LAN de status', async () => {
  const { context, calls } = await receiver(targets[0])
  await context.window.fetch('http://127.0.0.1:3100/v1/palco/sessions')
  assert.equal(calls[0].init.headers.get('X-Partner-Key'), config.stagingKey)
  await context.window.fetch('http://127.0.0.1:7080/status')
  assert.equal(calls[1].init, undefined)
})

test('preserva Request, headers explícitos e instalação única', async () => {
  const { context, calls, install } = await receiver(targets[0])
  const wrapper = context.window.fetch
  install()
  assert.equal(context.window.fetch, wrapper)
  const request = new Request('https://api-stg.pianolouvorja.com.br/v1/palco/sessions', {
    method: 'POST', body: 'conteúdo', headers: { 'X-Partner-Key': 'plj_explicita', 'X-Client-Version': 'custom' },
  })
  await context.window.fetch(request)
  assert.equal(calls[0].input, request)
  assert.equal(calls[0].init.headers.get('X-Partner-Key'), 'plj_explicita')
  assert.equal(calls[0].init.headers.get('X-Client-Version'), 'custom')
  assert.equal(await request.text(), 'conteúdo')
})

test('no-cors mantém opções intactas', async () => {
  const { context, calls } = await receiver(targets[0])
  const init = { mode: 'no-cors' }
  await context.window.fetch('https://api-stg.pianolouvorja.com.br/v1/palco/sessions', init)
  assert.equal(calls[0].init, init)
})

test('sem chave configurada mantém plataforma e versão', async () => {
  const { context, calls } = await receiver(targets[0], { stagingKey: '', productionKey: '' })
  await context.window.fetch('https://api-stg.pianolouvorja.com.br/v1/palco/sessions')
  assert.equal(calls[0].init.headers.has('X-Partner-Key'), false)
  assert.equal(calls[0].init.headers.get('X-Client-Version'), config.version)
})

test('erro síncrono de fetch não repete a requisição', async () => {
  const { context, calls } = await receiver(targets[0], { fail: true })
  assert.throws(() => context.window.fetch('https://api-stg.pianolouvorja.com.br/v1/palco/sessions'))
  assert.equal(calls.length, 1)
})

test('configuração de pacote é idempotente e omite chaves inválidas', async () => {
  const source = await readFile(new URL('../webos/index.html', import.meta.url), 'utf8')
  const configured = configureReceiver(source, config)
  assert.equal(configureReceiver(configured, config), configured)
  const { context, calls } = await receiver(targets[0], { stagingKey: 'inválida' })
  await context.window.fetch('https://api-stg.pianolouvorja.com.br/v1/palco/sessions')
  assert.equal(calls[0].init.headers.has('X-Partner-Key'), false)
})

test('CLI incorpora as chaves e a versão nos artefatos sem expor valores no log', async () => {
  const root = await mkdtemp(join(tmpdir(), 'palco-partner-'))
  try {
    for (const target of targets) {
      const path = join(root, target)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, await readFile(new URL('../' + target, import.meta.url)))
    }
    await writeFile(join(root, 'webos/appinfo.json'), JSON.stringify({ version: '9.8.7' }))
    const log = execFileSync(process.execPath, [
      fileURLToPath(new URL('../scripts/configure-partner-key.mjs', import.meta.url)), root,
    ], { env: { ...process.env, PARTNER_KEY_STG: config.stagingKey, PARTNER_KEY_PROD: config.productionKey }, encoding: 'utf8' })
    assert.ok(!log.includes(config.stagingKey))
    assert.ok(!log.includes(config.productionKey))
    const results = await Promise.all(targets.map(target => readFile(join(root, target), 'utf8')))
    for (const html of results) {
      assert.ok(html.includes('"version":"9.8.7"'))
      assert.ok(html.includes(config.stagingKey))
      assert.ok(html.includes(config.productionKey))
    }
    assert.equal(results[0], results[1])
    assert.equal(results[0], results[2])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
