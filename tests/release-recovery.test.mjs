import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const cases = [
  ['ci.yml', 'Validar origem da retomada', 'tizen-v0.5.0'],
  ['publish-update.yml', 'Validar tag e preservar validador da publicação', 'v0.5.0'],
];

for (const [workflow, step, tag] of cases) {
  test(`${workflow}: retomada exige main, tag estável e ancestralidade aprovada`, () => {
    const source = readFileSync(new URL(`../.github/workflows/${workflow}`, import.meta.url), 'utf8');
    const start = source.indexOf(`- name: ${step}`);
    assert.ok(start >= 0);
    const block = source.slice(start).match(/\n        run: \|\n([\s\S]*?)(?=\n      - )/);
    assert.ok(block);
    const command = block[1].replace(/^          /gm, '');
    const dir = mkdtempSync(join(tmpdir(), 'palco-release-origin-'));
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: process.env });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    const run = overrides => spawnSync('bash', ['-e', '-c', command], {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', RELEASE_TAG: tag, RUNNER_TEMP: join(dir, 'runner'), ...overrides },
    });
    try {
      git('init', '--initial-branch=main');
      git('config', 'user.name', 'Test');
      git('config', 'user.email', 'test@example.invalid');
      mkdirSync(join(dir, 'scripts'));
      mkdirSync(join(dir, 'runner'));
      copyFileSync(new URL('../scripts/validate-release-version.mjs', import.meta.url), join(dir, 'scripts/validate-release-version.mjs'));
      writeFileSync(join(dir, 'fixture'), 'reviewed');
      git('add', 'scripts', 'fixture');
      git('commit', '-m', 'reviewed main');
      const approved = git('rev-parse', 'HEAD');
      git('update-ref', 'refs/remotes/origin/main', approved);
      git('tag', tag, approved);
      assert.equal(run({}).status, 0, 'tag aprovada na main deve ser aceita');
      assert.notEqual(run({ GITHUB_REF: 'refs/heads/staging' }).status, 0);
      assert.notEqual(run({ RELEASE_TAG: 'main' }).status, 0);
      assert.notEqual(run({ RELEASE_TAG: 'v0.5.0-beta' }).status, 0);
      const orphan = git('commit-tree', git('rev-parse', 'HEAD^{tree}'), '-m', 'unreviewed');
      git('tag', workflow === 'ci.yml' ? 'tizen-v9.0.0' : 'v9.0.0', orphan);
      git('checkout', '--detach', orphan);
      assert.notEqual(run({ RELEASE_TAG: workflow === 'ci.yml' ? 'tizen-v9.0.0' : 'v9.0.0' }).status, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
