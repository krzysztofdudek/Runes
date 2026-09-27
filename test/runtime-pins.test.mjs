import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRuntimePins, formatRuntimePinReport } from '@chrisdudek/runes/testkit';

const root = fileURLToPath(new URL('..', import.meta.url));

function fakeConsumer(packages) {
  const dir = mkdtempSync(path.join(tmpdir(), 'runes-consumer-'));
  for (const [name, version] of Object.entries(packages)) {
    const p = path.join(dir, 'node_modules', name);
    mkdirSync(p, { recursive: true });
    writeFileSync(path.join(p, 'package.json'), JSON.stringify({ name, version }));
  }
  return dir;
}

test('Runes itself runs the pinned runtime, cli and relation grammar packages', () => {
  const problems = checkRuntimePins({ resolveFrom: root, languages: ['javascript', 'python', 'go', 'typescript'], cli: true });
  assert.deepEqual(problems, [], formatRuntimePinReport(problems));
});

test('a consumer on another runtime or grammar version, or missing a package, is reported', () => {
  const dir = fakeConsumer({ 'web-tree-sitter': '0.25.10', 'tree-sitter-go': '0.25.0', 'tree-sitter-python': '0.23.6' });
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

test('a vendored runtime passes its recorded version; languages built from source need no package', () => {
  const dir = fakeConsumer({});
  try {
    assert.deepEqual(checkRuntimePins({ resolveFrom: dir, languages: ['rust', 'kotlin'], versions: { 'web-tree-sitter': '0.27.0' } }), []);
    assert.throws(() => checkRuntimePins({ resolveFrom: dir, languages: ['cobol'] }), /pins no grammar for: cobol/);
    assert.equal(formatRuntimePinReport([]), 'runtime pins: every package is the pinned version');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
