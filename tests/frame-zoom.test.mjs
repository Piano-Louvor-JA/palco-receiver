// Zoom do quadro (imagem/PDF/PPT da liturgia) nas TVs: o app manda a página
// inteira uma vez e depois só zoom + posição (frameView). node:test puro.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const html = await readFile(new URL('../webos/index.html', import.meta.url), 'utf8')

/** Executa o applyFrameView real do receiver com um #bg falso. */
function frameView() {
  const source = html.match(/function applyFrameView\(view,anim\)\{[\s\S]*?\n\}/)
  assert.ok(source, 'applyFrameView ausente')
  const bg = { style: { transition: '', transform: '' } }
  const ctx = { $: (id) => (id === 'bg' ? bg : null), Math, Number, isFinite }
  runInNewContext(source[0], ctx)
  return { apply: ctx.applyFrameView, bg }
}

test('a TV avisa no hello que aplica o zoom do quadro sozinha', () => {
  assert.match(html, /type:'hello',role:'tv',platform:palcoPlatform\(\),id:palcoId\(\),caps:\[[^\]]*'frameView'/)
})

test('quadro de slide aparece inteiro (contain) e aceita zoom', () => {
  assert.match(html, /#bg\.frame-slide\{object-fit:contain;background:#000;transform-origin:50% 50%\}/)
  assert.match(html, /const isFrameSlide=m\.frameSlide===true\|\|\(typeof m\.background==='string'&&m\.background\.indexOf\('data:image\/'\)===0\);/)
  assert.match(html, /bgEl\.classList\.toggle\('frame-slide',isFrameSlide\);\n      applyFrameView\(isFrameSlide\?m\.view:null,0\);/)
})

test('frameView só mexe num quadro de slide; outro conteúdo zera o zoom', () => {
  assert.match(html, /if\(m\.type==='frameView'\)\{if\(\$\('bg'\)\.className\.indexOf\('frame-slide'\)>=0\)applyFrameView\(m\.view,m\.view&&m\.view\.anim\);return;\}/)
  for (const type of ['video', 'audio', 'idle', 'bgPalco', 'stop-all', 'timer']) {
    assert.match(html, new RegExp(`m\\.type==='${type}'[^\\n]*applyFrameView\\(null,0\\)`), `${type} não zera o zoom`)
  }
})

test('zoom igual ao do operador: escala e deslocamento em fração da tela, animado', () => {
  const { apply, bg } = frameView()
  apply({ zoom: 2, x: 0.1, y: -0.05 }, 140)
  assert.equal(bg.style.transform, 'translate(10%,-5%) scale(2)')
  assert.match(bg.style.transition, /^transform 140ms /)
  // limites: zoom até 5×, animação até 400 ms, valores inválidos viram 0
  apply({ zoom: 99, x: 'x', y: null }, 9999)
  assert.equal(bg.style.transform, 'translate(0%,0%) scale(5)')
  assert.match(bg.style.transition, /^transform 400ms /)
  // sem zoom: sem transformação e sem animação
  apply({ zoom: 1, x: 0, y: 0 }, 0)
  assert.equal(bg.style.transform, '')
  assert.equal(bg.style.transition, '')
  apply(null, 0)
  assert.equal(bg.style.transform, '')
})
