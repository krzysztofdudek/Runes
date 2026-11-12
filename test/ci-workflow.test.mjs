import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** The text of one top-level job of the workflow: from its `  name:` line to the next job. */
function job(name) {
  const lines = workflow.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  assert.ok(start >= 0, `the workflow has no job ${name}`);
  const end = lines.findIndex((line, i) => i > start && /^ {2}[\w-]+:$/.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

const PLATFORMS = [
  ['test', 'ubuntu-latest'],
  ['test-windows', 'windows-latest'],
  ['test-macos', 'macos-latest'],
];

for (const [name, runner] of PLATFORMS) {
  test(`the ${name} job runs the suite on ${runner}, on Node 22 and 24, without stopping the others at the first failure`, () => {
    const text = job(name);
    assert.match(text, new RegExp(`^ {4}runs-on: ${runner}$`, 'm'));
    assert.match(text, /^ {6}fail-fast: false$/m);
    assert.match(text, /^ {8}node: \[22, 24\]$/m);
  });
}

test('the Windows job runs the suite in three shards, and every job that is not Linux reads the grammars the grammars job built', () => {
  const windows = job('test-windows');
  assert.match(windows, /^ {8}shard: \[1, 2, 3\]$/m);
  assert.match(windows, /^ {8}run: npm test -- --test-shard=\$\{\{ matrix\.shard \}\}\/3$/m);
  for (const text of [windows, job('test-macos')]) {
    assert.match(text, /^ {4}needs: grammars$/m);
    assert.match(text, /^ {6}RUNES_GRAMMAR_OFFLINE: '1'$/m);
    assert.match(text, /^ {10}name: grammar-cache$/m);
    assert.match(text, /^ {8}run: npm run check:dist$/m);
  }
});

test('the shards of the Windows job together run every test file once', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'runes-shards-'));
  try {
    const names = Array.from({ length: 11 }, (_, i) => `file-${String(i).padStart(2, '0')}`);
    for (const name of names) writeFileSync(path.join(dir, `${name}.test.mjs`), `import test from 'node:test'; test('ran ${name}', () => {});`);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const ran = [1, 2, 3].map((shard) => {
      const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', `--test-shard=${shard}/3`, '**/*.test.mjs'], { cwd: dir, encoding: 'utf8', timeout: 60000, env });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      return [...r.stdout.matchAll(/ran (file-\d+)/g)].map((m) => m[1]);
    });
    assert.deepEqual(ran.flat().sort(), names, 'every file once');
    assert.ok(ran.every((files) => files.length >= 3), JSON.stringify(ran));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
