// Contrato das ações do módulo Palco (celular/computador → uma TV) e da tela
// compartilhada da projeção independente. node:test puro, sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const html = await readFile(new URL('../webos/index.html', import.meta.url), 'utf8')

test('a TV se identifica ao conectar (hello com plataforma, id e versão)', () => {
  assert.match(html, /function sendHello\(\)/)
  assert.match(html, /type:'hello',role:'tv',platform:palcoPlatform\(\),id:palcoId\(\)/)
  assert.match(html, /ws\.onopen=[\s\S]{0,120}sendHello\(\)/)
})

test('comandos por TV: identificar, renomear, recarregar e mover', () => {
  for (const type of ['identify', 'rename', 'reload', 'moveTo']) {
    assert.match(html, new RegExp(`m\\.type==='${type}'`), `${type} ausente`)
  }
  assert.match(html, /np>=1024&&np<=65535/, 'moveTo sem validação de porta')
})

test('compartilhar: dois painéis, só a página principal conecta', () => {
  assert.match(html, /const SHARE_PANE=qs\.get\('obsPane'\)==='1'/)
  assert.match(html, /if\(m\.type==='tvShare'\)\{shareEnable\(m\.enabled===true\);return;\}/)
  // o compartilhar da transmissão inteira (OBS) não mexe na tela da TV
  assert.match(html, /if\(m\.type==='obsShare'\)return;/)
  assert.match(html, /const index=m\.obsPane===true\?1:0/)
  // página local (file://) é origem opaca: painéis falam por postMessage
  assert.match(html, /contentWindow\.postMessage\(/)
  assert.match(html, /if\(SHARE_PANE\)window\.addEventListener\('message'/)
  assert.match(html, /\(function\(\)\{\n  if\(SHARE_PANE\)return;\n  var bootCode/, 'painel não pode abrir WebSocket')
})

test('tela de espera: "Aguardando transmissão…" e logo pulsando', () => {
  assert.match(html, /<p id="idleMsg">Aguardando transmissão…<\/p>/)
  assert.doesNotMatch(html, /Aguardando conteúdo/)
  assert.match(html, /#idleLogo\{animation:idleLogoFade 3\.2s ease-in-out infinite\}/)
})
