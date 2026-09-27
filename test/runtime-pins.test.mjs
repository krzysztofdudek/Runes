import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { checkRuntimePins, formatRuntimePinReport } from '@chrisdudek/runes/testkit';
import { loadGrammarManifest } from '@chrisdudek/runes/grammars';

const root = fileURLToPath(new URL('..', import.meta.url));

const realWasm = createRequire(import.meta.url).resolve('web-tree-sitter/web-tree-sitter.wasm');
const pinnedWasm = loadGrammarManifest().runtime.wasmSha256;

function fakeConsumer(packages, runtimeWasm) {
  const dir = mkdtempSync(path.join(tmpdir(), 'runes-consumer-'));
  for (const [name, version] of Object.entries(packages)) {
    const p = path.join(dir, 'node_modules', name);
    mkdirSync(p, { recursive: true });
    writeFileSync(path.join(p, 'package.json'), JSON.stringify({ name, version }));
    if (name === 'web-tree-sitter' && runtimeWasm !== undefined) writeFileSync(path.join(p, 'web-tree-sitter.wasm'), runtimeWasm);
  }
  return dir;
}

test('Runes itself runs the pinned runtime, cli and relation grammar packages', () => {
  const problems = checkRuntimePins({ resolveFrom: root, languages: ['javascript', 'python', 'go', 'typescript'], cli: true });
  assert.deepEqual(problems, [], formatRuntimePinReport(problems));
});

test('a consumer on another runtime or grammar version, or missing a package, is reported', () => {
  const dir = fakeConsumer({ 'web-tree-sitter': '0.25.10', 'tree-sitter-go': '0.25.0', 'tree-sitter-python': '0.23.6' }, readFileSync(realWasm));
  try {
    const problems = checkRuntimePins({ resolveFrom: dir, languages: ['go', 'python', 'javascript'] });
    assert.deepEqual(problems, [
      { package: 'web-tree-sitter', role: 'runtime', expected: '0.27.0', installed: '0.25.10' },
      { package: 'tree-sitter-javascript', role: 'javascript', expected: '0.25.0' },
      { package: 'tree-sitter-python', role: 'python', expected: '0.25.0', installed: '0.23.6' },
    ]);
    const report = formatRuntimePinReport(problems);
    assert.match(report, /web-tree-sitter \(runtime\): pinned 0\.27\.0, installed 0\.25\.10/);
    assert.match(report, /tree-sitter-javascript \(javascript\): pinned 0\.25\.0, not installed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the right version with other engine bytes is reported: the runtime WASM is checked by sha256', () => {
  const other = Buffer.from('not the pinned engine');
  const dir = fakeConsumer({ 'web-tree-sitter': '0.27.0' }, other);
  try {
    const problems = checkRuntimePins({ resolveFrom: dir, languages: [] });
    assert.deepEqual(problems, [{ package: 'web-tree-sitter', role: 'runtime wasm', expected: pinnedWasm, installed: createHash('sha256').update(other).digest('hex') }]);
    const noWasm = fakeConsumer({ 'web-tree-sitter': '0.27.0' });
    try {
      const missing = checkRuntimePins({ resolveFrom: noWasm, languages: [] });
      assert.deepEqual(missing, [{ package: 'web-tree-sitter', role: 'runtime wasm', expected: pinnedWasm }]);
      assert.match(formatRuntimePinReport(missing), /no web-tree-sitter\.wasm found/);
    } finally {
      rmSync(noWasm, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a vendored runtime passes its recorded version and its copy of the WASM; languages built from source need no package', () => {
  const dir = fakeConsumer({});
  try {
    assert.deepEqual(checkRuntimePins({ resolveFrom: dir, languages: ['rust', 'kotlin'], versions: { 'web-tree-sitter': '0.27.0' }, runtimeWasm: realWasm }), []);
    assert.equal(checkRuntimePins({ resolveFrom: dir, languages: [], versions: { 'web-tree-sitter': '0.27.0' } })[0].role, 'runtime wasm');
    assert.throws(() => checkRuntimePins({ resolveFrom: dir, languages: ['cobol'] }), /pins no grammar for: cobol/);
    assert.equal(formatRuntimePinReport([]), 'runtime pins: every package is the pinned version');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
