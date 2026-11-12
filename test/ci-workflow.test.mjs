import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

test('the shards of the Windows job, started as the workflow starts them, run every test file once and no file twice', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'runes-shards-'));
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const runner = pkg.scripts.test.split(' && ').at(-1);
    assert.match(runner, /^node scripts\/test\.mjs$/, 'npm appends the options of `npm test --` to the last command, so it must be the one that hands them to node ahead of the pattern');
    const flag = /npm test -- (--test-shard=\S+)$/m.exec(job('test-windows'))[1];
    assert.equal(flag, '--test-shard=${{ matrix.shard }}/3');
    const names = Array.from({ length: 11 }, (_, i) => `file-${String(i).padStart(2, '0')}`);
    mkdirSync(path.join(dir, 'test', 'nested'), { recursive: true });
    names.forEach((name, i) => writeFileSync(path.join(dir, 'test', i % 2 === 0 ? '' : 'nested', `${name}.test.mjs`), `import test from 'node:test'; test('ran ${name}', () => {});`));
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = (...options) => {
      const r = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/test.mjs', import.meta.url)), '--test-reporter=spec', ...options], { cwd: dir, encoding: 'utf8', timeout: 60000, env });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      return [...r.stdout.matchAll(/ran (file-\d+)/g)].map((m) => m[1]);
    };
    const full = run();
    assert.deepEqual([...full].sort(), names, 'the unsharded run has every file');
    const shards = [1, 2, 3].map((k) => run(flag.replace('${{ matrix.shard }}', String(k))));
    assert.ok(shards.every((files) => files.length >= 3 && files.length < names.length), JSON.stringify(shards));
    assert.deepEqual(shards.flat().sort(), [...full].sort(), 'together the shards run the full run\'s files, each once');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
