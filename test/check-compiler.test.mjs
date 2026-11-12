import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilerProblems, COMPILER_PATH } from '../scripts/check-compiler.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

function fakeRepository({ pin = '7.0.2', reported = '7.0.2', scripts = { build: `node ${COMPILER_PATH} -p tsconfig.json` }, runnable = true }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'runes-compiler-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts, devDependencies: { typescript: pin } }));
  mkdirSync(path.join(dir, path.dirname(COMPILER_PATH)), { recursive: true });
  writeFileSync(path.join(dir, COMPILER_PATH), runnable ? `console.log('Version ${reported}');\n` : 'process.exit(3);\n');
  return dir;
}

test('Runes builds with the compiler package.json pins, called by its package path', () => {
  assert.deepEqual(compilerProblems(root), []);
});

test('a compiler that reports another version than the pin fails the check', () => {
  const dir = fakeRepository({ reported: '6.0.3' });
  try {
    assert.deepEqual(compilerProblems(dir), [`${COMPILER_PATH} reports "Version 6.0.3", package.json pins 7.0.2`]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a script that runs a bare tsc fails the check, whatever else it runs', () => {
  const dir = fakeRepository({ scripts: { build: 'node scripts/clean-dist.mjs && tsc -p tsconfig.json', typecheck: 'tsc --noEmit', check: 'node scripts/x.mjs', direct: `./node_modules/.bin/tsc -p a`, older: 'tsc6 -p tsconfig.json', ok: `node ${COMPILER_PATH} -p tsconfig.relations.json` } });
  try {
    assert.deepEqual(compilerProblems(dir), [
      `script "build" runs a bare tsc; call it as node ${COMPILER_PATH}`,
      `script "typecheck" runs a bare tsc; call it as node ${COMPILER_PATH}`,
      `script "direct" runs a bare tsc; call it as node ${COMPILER_PATH}`,
      `script "older" runs a bare tsc6; call it as node ${COMPILER_PATH}`,
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a compiler that does not run, and a pin that is not an exact version, fail the check', () => {
  const dir = fakeRepository({ pin: '^7.0.2', runnable: false });
  try {
    const problems = compilerProblems(dir);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /must pin an exact version, not "\^7\.0\.2"/);
    assert.match(problems[1], /does not run/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
