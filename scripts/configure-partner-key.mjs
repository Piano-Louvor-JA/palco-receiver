// Incorpora a identidade no HTML antes de empacotar/publicar; nunca imprime chaves.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const marker = /var partnerConfig=\/\* PALCO_PARTNER_CONFIG \*\/\{[^;\n]*\};/
const targets = ['webos/index.html', 'tizen/index.html', 'androidtv/assets/palco/receiver.html', 'browser/index.html']

function normalizeKey(value) {
  const key = String(value || '').trim()
  return /^plj_[A-Za-z0-9_-]+$/.test(key) ? key : ''
}

export function configureReceiver(html, options = {}) {
  if (!marker.test(html)) throw new Error('Marcador de identidade ausente no receiver')
  const config = JSON.stringify({
    staging: normalizeKey(options.stagingKey),
    production: normalizeKey(options.productionKey),
    version: String(options.version || ''),
  }).replace(/</g, '\\u003c')
  return html.replace(marker, () => 'var partnerConfig=/* PALCO_PARTNER_CONFIG */' + config + ';')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] || dirname(fileURLToPath(new URL('../README.md', import.meta.url))))
  const version = JSON.parse(readFileSync(resolve(root, 'webos/appinfo.json'), 'utf8')).version
  const options = { stagingKey: process.env.PARTNER_KEY_STG, productionKey: process.env.PARTNER_KEY_PROD, version }
  // Verifica todos os arquivos antes de começar a escrita.
  const configured = targets.map(target => [resolve(root, target), configureReceiver(readFileSync(resolve(root, target), 'utf8'), options)])
  for (const [path, html] of configured) writeFileSync(path, html)
  console.log('Identidade de parceiro configurada nos quatro receivers; versão ' + version)
}
