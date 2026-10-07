// Paridade das 3 variantes do receiver + contrato de protocolo.
// node:test puro — sem deps, sem paths absolutos, roda em qualquer máquina/CI.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const webos = await readFile(new URL('../webos/index.html', import.meta.url), 'utf8')
const androidtv = await readFile(new URL('../androidtv/assets/palco/receiver.html', import.meta.url), 'utf8')
const tizen = await readFile(new URL('../tizen/index.html', import.meta.url), 'utf8')

test('paridade: webos == androidtv == tizen (byte-a-byte)', () => {
  assert.equal(webos, androidtv, 'webos difere de androidtv')
  assert.equal(webos, tizen, 'webos difere de tizen')
})

for (const [name, html] of [['webos', webos], ['androidtv', androidtv], ['tizen', tizen]]) {
  test(`contrato de protocolo em ${name}`, () => {
    // handler central de mensagens do palco
    assert.match(html, /function handle/, 'handle() ausente')
    assert.match(html, /JSON\.parse\(ev\.data\)/, 'parse do WS ausente')
    // WS local (IP:porta) + modo cloud (relay da API)
    assert.match(html, /new WebSocket/, 'WebSocket ausente')
    assert.match(html, /\/palco['"]/, 'rota WS local ausente')
    assert.match(html, /sessions\/:code\/token/, 'rota de token cloud ausente')
    assert.match(html, /\/v1\/palco/, 'relay WS ausente')
    // reconexão com backoff
    assert.match(html, /Math\.pow\(2,tries/, 'backoff de reconexão ausente')
    // persistência do host/porta
    assert.match(html, /palcoHost/, 'storage do host ausente')
  })

  test(`UI mínima em ${name}`, () => {
    assert.match(html, /id="text"/, 'elemento de texto ausente')
    assert.match(html, /id="footer"/, 'footer ausente')
    assert.match(html, /id="timer"/, 'timer ausente')
    assert.match(html, /id="splash"/, 'splash ausente')
    // identidade
    assert.match(html, /#FCCE02|fcce02/, 'amarelo da marca ausente')
  })
}
