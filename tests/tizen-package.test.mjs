import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('o comando real de empacotamento inclui os scripts e imagens locais do HTML', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const block = workflow.match(/- name: Empacota wgt\n\s+run: \|\n([\s\S]*?)(?=\n      - name:|$)/);
  assert.ok(block, 'etapa de empacotamento deve existir');
  const command = block[1].replace(/^          /gm, '');
  const dir = mkdtempSync(join(tmpdir(), 'palco-tizen-package-'));
  try {
    cpSync(new URL('../tizen/', import.meta.url), join(dir, 'tizen'), { recursive: true });
    const result = spawnSync('bash', ['-e', '-c', command], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const archive = readdirSync(dir).find(name => name.endsWith('.wgt'));
    assert.ok(archive, 'WGT deve ser gerado');
    const listing = spawnSync('unzip', ['-Z1', join(dir, archive)], { encoding: 'utf8' });
    assert.equal(listing.status, 0, listing.stderr);
    const files = new Set(listing.stdout.trim().split('\n'));
    const html = readFileSync(join(dir, 'tizen/index.html'), 'utf8');
    const sources = Array.from(html.matchAll(/<(?:script|img)\b[^>]*\bsrc=['"]([^'"]+)['"]/g), match => match[1]);
    assert.ok(sources.includes('i18n.js'));
    assert.ok(sources.includes('network-mirror.js'));
    for (const source of sources.filter(value => !/^(?:https?:|data:|\/)/.test(value))) {
      assert.ok(files.has(source.replace(/^\.\//, '')), `${source} deve estar no WGT`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
