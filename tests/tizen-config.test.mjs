// tizen/config.xml precisa passar na validação do Tizen (senão a TV recusa
// com "Load archive info fail") e acompanhar a versão do receiver.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const xml = await readFile(new URL('../tizen/config.xml', import.meta.url), 'utf8')
const appinfo = JSON.parse(await readFile(new URL('../webos/appinfo.json', import.meta.url), 'utf8'))

const attr = (tag, name) => {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*\\s${name}="([^"]*)"`))
  return m ? m[1] : null
}

test('package tem exatamente 10 letras/números', () => {
  assert.match(attr('tizen:application', 'package'), /^[A-Za-z0-9]{10}$/)
})

test('id da aplicação é <package>.<nome>', () => {
  const pkg = attr('tizen:application', 'package')
  assert.match(attr('tizen:application', 'id'), new RegExp(`^${pkg}\\.[A-Za-z0-9]+$`))
})

test('versão do widget = versão do receiver (appinfo.json)', () => {
  assert.equal(attr('widget', 'version'), appinfo.version)
})

for (const p of ['http://tizen.org/privilege/internet', 'http://tizen.org/privilege/tv.inputdevice']) {
  test(`declara o privilégio ${p.split('/').pop()}`, () => {
    assert.ok(xml.includes(`<tizen:privilege name="${p}"/>`), `falta ${p}`)
  })
}
