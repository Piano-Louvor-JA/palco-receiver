import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { validateReleaseVersion } from '../scripts/validate-release-version.mjs';

test('ignora fallback vazio de identidade antes da versão real', () => {
  const html = "var version=config.version||window.__PALCO_APPV__||''; window.__PALCO_APPV__=window.__PALCO_APPV__||'0.5.0';";
  assert.equal(validateReleaseVersion('v0.5.0', '0.5.0', html), '0.5.0');
});

test('aceita espaços e aspas duplas no fallback', () => {
  assert.equal(validateReleaseVersion('v0.5.0', '0.5.0', 'window.__PALCO_APPV__ || "0.5.0"'), '0.5.0');
});

test('recusa versão ausente, divergente e tags fora do formato estável', () => {
  const correct = "window.__PALCO_APPV__||'0.5.0'";
  for (const html of ["window.__PALCO_APPV__||''", "window.__PALCO_APPV__||'0.4.0'", `${correct};window.__PALCO_APPV__||'0.4.0'`]) {
    assert.throws(() => validateReleaseVersion('v0.5.0', '0.5.0', html));
  }
  assert.throws(() => validateReleaseVersion('v0.5.0', '0.4.0', correct));
  for (const tag of ['', 'main', 'v0.5.0-beta', 'v0.05.0', 'webos-v0.5.0']) {
    assert.throws(() => validateReleaseVersion(tag, '0.5.0', correct));
  }
});

test('validador preservado fora do checkout valida uma tag antiga sem o script', () => {
  const dir = mkdtempSync(join(tmpdir(), 'palco-version-recovery-'));
  try {
    const validator = join(dir, 'saved-validator.mjs');
    copyFileSync(new URL('../scripts/validate-release-version.mjs', import.meta.url), validator);
    const checkout = join(dir, 'old-tag');
    mkdirSync(join(checkout, 'webos'), { recursive: true });
    writeFileSync(join(checkout, 'webos/appinfo.json'), JSON.stringify({ version: '0.5.0' }));
    writeFileSync(join(checkout, 'webos/index.html'), "window.__PALCO_APPV__||'';window.__PALCO_APPV__||'0.5.0'");
    const result = spawnSync(process.execPath, [validator, 'v0.5.0'], { cwd: checkout, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /0\.5\.0 OK/);
    const mismatch = spawnSync(process.execPath, [validator, 'v0.6.0'], { cwd: checkout, encoding: 'utf8' });
    assert.notEqual(mismatch.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
