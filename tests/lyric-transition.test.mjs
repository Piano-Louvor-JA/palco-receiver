// Transição dos slides das músicas (e da Bíblia) nas TVs: o app manda
// `transition` (fade/slide/zoom) e `transitionMs` só quando as transições
// estão habilitadas na Personalização. Sem o campo, troca seca. node:test puro.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const html = await readFile(new URL('../webos/index.html', import.meta.url), 'utf8')

function fn(name) {
  const start = html.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} ausente`)
  let depth = 0
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1)
  }
  throw new Error(`fim de ${name}`)
}

function fakeEl() {
  const classes = new Set()
  return {
    classes,
    style: { vars: {}, setProperty(k, v) { this.vars[k] = v } },
    classList: { add: (c) => classes.add(c), remove(...cs) { cs.forEach((c) => classes.delete(c)) } },
    get offsetWidth() { return 1 },
  }
}

// Catálogo do app (STAGE_TRANSITION_OPTIONS sem 'none').
const CATALOG = ['fade', 'slide', 'slide-down', 'slide-left', 'slide-right', 'zoom', 'zoom-out', 'blur', 'wipe', 'iris',
  'curtain', 'flip', 'drop', 'rotate', 'swing', 'flip-h', 'pop', 'stretch', 'cinema', 'wipe-up', 'wipe-down',
  'diagonal', 'glow', 'float', 'zoom-blur']

function block() {
  const start = html.indexOf('// rx-transitions:start')
  const end = html.indexOf('// rx-transitions:end')
  assert.ok(start >= 0 && end > start, 'bloco rx-transitions ausente')
  return html.slice(start, end)
}

/** Roda o código real das transições com um ambiente falso (suporte a translate configurável). */
function setup({ supportsMotion = true } = {}) {
  const ctx = {
    window: { CSS: { supports: () => supportsMotion } },
    getComputedStyle: () => ({ transform: 'none' }),
    Number,
  }
  runInNewContext(`${block()}\nthis.enter=projectionEnter`, ctx)
  return ctx.enter
}

test('a TV tem entrada e saída para cada transição do app', () => {
  for (const name of CATALOG) {
    assert.ok(html.includes(`.rx-enter-${name}{`), `entrada ${name}`)
    assert.ok(html.includes(`.rx-ghost-leave-${name}{`), `saída ${name}`)
  }
  assert.match(html, /projectionEnter\(m,\[\$\('text'\),\$\('footer'\)\],projectionGhost\)/)
})

test('música com transição habilitada: anima o texto novo na duração mandada', () => {
  const enter = setup()
  const text = fakeEl()
  enter({ scope: 'hymns', text: 'Santo, Santo', transition: 'slide', transitionMs: 400 }, [text])
  assert.ok(text.classes.has('rx-enter-slide'))
  assert.equal(text.style.vars['--rx-ms'], '400ms')
  assert.equal(text.style.vars['--rx-delay'], '0ms')
})

test('nome real (transitionName) vence o aproximado; nome desconhecido usa o aproximado', () => {
  const enter = setup()
  const text = fakeEl()
  enter({ scope: 'hymns', text: 'A', transition: 'zoom', transitionName: 'curtain' }, [text])
  assert.ok(text.classes.has('rx-enter-curtain'))
  enter({ scope: 'hymns', text: 'B', transition: 'slide', transitionName: 'portal' }, [text])
  assert.deepEqual([...text.classes], ['rx-enter-slide'])
})

test('slide seguinte espera a saída do anterior (out-in, como nos monitores)', () => {
  const enter = setup()
  const text = fakeEl()
  enter({ scope: 'hymns', text: 'A', transition: 'fade', transitionMs: 300 }, [text])
  enter({ scope: 'hymns', text: 'B', transition: 'fade', transitionMs: 300 }, [text])
  assert.equal(text.style.vars['--rx-delay'], '300ms')
})

test('sem o campo (transições desligadas): troca seca', () => {
  const enter = setup()
  const text = fakeEl()
  enter({ scope: 'hymns', text: 'Santo' }, [text])
  assert.equal(text.classes.size, 0)
})

test('mesmo slide reenviado não anima de novo; slide novo anima, mesmo com a mesma letra', () => {
  const enter = setup()
  const text = fakeEl()
  enter({ scope: 'hymns', text: 'A', transition: 'fade', slideIndex: 1 }, [text])
  text.classes.clear()
  enter({ scope: 'hymns', text: 'A', transition: 'fade', slideIndex: 1 }, [text])
  assert.equal(text.classes.size, 0)
  enter({ scope: 'hymns', text: 'A', transition: 'fade', slideIndex: 2 }, [text])
  assert.ok(text.classes.has('rx-enter-fade'))
})

test('TV sem translate/scale avulsos (webOS antigo): movimento vira esmaecer, recorte continua', () => {
  const enter = setup({ supportsMotion: false })
  const text = fakeEl()
  enter({ scope: 'hymns', text: 'X', transition: 'zoom' }, [text])
  assert.ok(text.classes.has('rx-enter-fade'))
  enter({ scope: 'hymns', text: 'Y', transition: 'slide', transitionName: 'slide-left' }, [text])
  assert.deepEqual([...text.classes], ['rx-enter-fade'])
  enter({ scope: 'hymns', text: 'Z', transition: 'fade', transitionName: 'wipe' }, [text])
  assert.deepEqual([...text.classes], ['rx-enter-wipe'])
})

test('outros módulos (relógio, cronômetro…) não animam', () => {
  const enter = setup()
  const text = fakeEl()
  enter({ scope: 'clock', text: '10:00', transition: 'fade' }, [text])
  assert.equal(text.classes.size, 0)
})

test('as três cópias do receiver (webOS, Tizen, Android TV) são iguais', async () => {
  const tizen = await readFile(new URL('../tizen/index.html', import.meta.url), 'utf8')
  const android = await readFile(new URL('../androidtv/assets/palco/receiver.html', import.meta.url), 'utf8')
  assert.equal(tizen, html)
  assert.equal(android, html)
})
