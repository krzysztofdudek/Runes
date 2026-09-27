import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { validateGrammarManifest, parseGrammarManifest, GRAMMAR_MANIFEST_SCHEMA } from '@chrisdudek/runes/grammars';

const require = createRequire(import.meta.url);
const manifestPath = require.resolve('@chrisdudek/runes/grammars/manifest.json');
const pkg = JSON.parse(readFileSync(require.resolve('@chrisdudek/runes/package.json'), 'utf8'));
const hex = (c) => c.repeat(64);

test('the shipped manifest is valid and reachable through the package exports', () => {
  const manifest = parseGrammarManifest(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schema, GRAMMAR_MANIFEST_SCHEMA);
});

test('the runtime pin equals the web-tree-sitter peer dependency', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.runtime.version, pkg.peerDependencies['web-tree-sitter']);
});

test('a manifest with each source kind validates', () => {
  const m = {
    schema: 'runes-grammars/1',
    runtime: { package: 'web-tree-sitter', version: '0.27.0' },
    grammars: [
      { language: 'typescript', wasmFile: 'tree-sitter-typescript.wasm', source: { kind: 'npm', package: 'tree-sitter-typescript', version: '0.23.2', path: 'tree-sitter-typescript.wasm' }, sha256: { wasm: hex('a'), nodeTypes: hex('b') } },
      { language: 'go', wasmFile: 'tree-sitter-go.wasm', source: { kind: 'github-release', repo: 'tree-sitter/tree-sitter-go', tag: 'v0.23.4', asset: 'tree-sitter-go.wasm' }, sha256: { wasm: hex('c'), nodeTypes: hex('d') } },
      { language: 'php', wasmFile: 'tree-sitter-php.wasm', source: { kind: 'git', repo: 'https://github.com/tree-sitter/tree-sitter-php', commit: '0'.repeat(40), subdir: 'php' }, sha256: { wasm: hex('e'), nodeTypes: hex('f') }, patches: ['patches/php-heredoc.patch'] },
    ],
  };
  assert.deepEqual(validateGrammarManifest(m), []);
});

test('invalid manifests list every problem', () => {
  const bad = {
    schema: 'runes-grammars/2',
    runtime: { package: 'web-tree-sitter', version: '^0.27.0' },
    grammars: [
      { language: 'go', wasmFile: 'go.wasm', source: { kind: 'npm', package: 'x', version: '1.0' , path: 'x.wasm' }, sha256: { wasm: 'nope', nodeTypes: hex('a') }, extra: 1 },
      { language: 'go', wasmFile: 'go.wasm', source: { kind: 'git', repo: 'r', commit: 'abc' }, sha256: { wasm: hex('a'), nodeTypes: hex('b') }, patches: ['../evil.patch'] },
      { language: 'x', wasmFile: 'x.wasm', source: { kind: 'ftp' }, sha256: { wasm: hex('a'), nodeTypes: hex('b') } },
    ],
  };
  const errors = validateGrammarManifest(bad);
  for (const expected of [
    'manifest.schema', 'manifest.runtime.version', "manifest.grammars[0]: unknown key 'extra'", 'manifest.grammars[0].source.version', 'manifest.grammars[0].sha256.wasm',
    "manifest.grammars[1].language: duplicate 'go'", "manifest.grammars[1].wasmFile: duplicate 'go.wasm'", 'manifest.grammars[1].source.commit', 'manifest.grammars[1].patches[0]', 'manifest.grammars[2].source.kind',
  ]) assert.ok(errors.some((e) => e.startsWith(expected)), `expected an error starting '${expected}' in:\n${errors.join('\n')}`);
  assert.throws(() => parseGrammarManifest(JSON.stringify(bad)), /invalid grammar manifest/);
});
