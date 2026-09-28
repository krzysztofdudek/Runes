import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, readdirSync, mkdirSync, cpSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadGrammarManifest, buildGrammars, verifyGrammarFiles, LANGUAGES,
} from '@chrisdudek/runes/grammars';
import {
  validateGrammarManifest, parseGrammarManifest, GRAMMAR_MANIFEST_SCHEMA, shippedGrammarsDir, syntaxNodeTypesFile,
} from './helpers/internal/grammars.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const manifestPath = require.resolve('@chrisdudek/runes/grammars/manifest.json');
const pkg = JSON.parse(readFileSync(require.resolve('@chrisdudek/runes/package.json'), 'utf8'));
const hex = (c) => c.repeat(64);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const manifest = loadGrammarManifest();
const byLanguage = new Map(manifest.grammars.map((g) => [g.language, g]));

describe('the shipped manifest', () => {
  test('is valid and reachable through the package exports', () => {
    const m = parseGrammarManifest(readFileSync(manifestPath, 'utf8'));
    assert.equal(m.schema, GRAMMAR_MANIFEST_SCHEMA);
    assert.equal(path.resolve(shippedGrammarsDir(), 'manifest.json'), manifestPath);
  });

  test('the runtime pin equals the web-tree-sitter peer and dev dependency, and the cli pin the tree-sitter-cli dev dependency', () => {
    assert.equal(manifest.runtime.version, '0.27.0');
    assert.equal(manifest.runtime.version, pkg.peerDependencies['web-tree-sitter']);
    assert.equal(manifest.runtime.version, pkg.devDependencies['web-tree-sitter']);
    assert.equal(manifest.cli.version, pkg.devDependencies['tree-sitter-cli']);
  });

  test('the runtime pin carries the sha256 of the installed web-tree-sitter.wasm', () => {
    assert.equal(manifest.runtime.wasmSha256, sha(readFileSync(require.resolve('web-tree-sitter/web-tree-sitter.wasm'))));
  });

  test('pins the union of the two family grammar sets: 16 shared languages and 7 more', () => {
    const shared = ['typescript', 'tsx', 'javascript', 'python', 'go', 'rust', 'java', 'csharp', 'c', 'cpp', 'php', 'ruby', 'json', 'kotlin', 'yaml', 'toml'];
    const more = ['scala', 'bash', 'lua', 'zig', 'groovy', 'solidity', 'properties'];
    assert.deepEqual(manifest.grammars.map((g) => g.language), [...shared, ...more]);
  });

  test('every language of the table has a pinned grammar under the same file name', () => {
    for (const def of Object.values(LANGUAGES)) {
      const pin = byLanguage.get(def.id);
      assert.ok(pin, `no pin for ${def.id}`);
      assert.equal(pin.wasmFile, def.wasmFile, def.id);
    }
  });

  test('PHP is the php grammar (PHP with the HTML around it), not php_only', () => {
    const php = byLanguage.get('php');
    assert.equal(php.wasmFile, 'tree-sitter-php.wasm');
    assert.equal(php.source.kind, 'source');
    assert.equal(php.source.dir, 'php');
    assert.equal(LANGUAGES.php.wasmFile, 'tree-sitter-php.wasm');
  });

  test('every patch a pin names exists, and every shipped patch is named by a pin', () => {
    const named = new Set(manifest.grammars.flatMap((g) => (g.source.kind === 'source' ? g.source.patches ?? [] : [])));
    for (const p of named) assert.ok(existsSync(path.join(shippedGrammarsDir(), p)), `missing ${p}`);
    const shipped = readdirSync(path.join(shippedGrammarsDir(), 'patches')).map((f) => `patches/${f}`);
    assert.deepEqual(shipped.sort(), [...named].sort());
    assert.equal(named.size, 4);
  });

  test('the npm grammar packages Runes installs are the pinned versions', () => {
    for (const g of manifest.grammars) {
      if (g.source.kind !== 'npm' || pkg.devDependencies[g.source.package] === undefined) continue;
      assert.equal(pkg.devDependencies[g.source.package], g.source.version, g.source.package);
    }
  });
});

describe('validateGrammarManifest', () => {
  const base = { schema: 'runes-grammars/1', runtime: { package: 'web-tree-sitter', version: '0.27.0', wasmSha256: hex('9') }, cli: { package: 'tree-sitter-cli', version: '0.27.0' } };

  test('a manifest with each source kind validates', () => {
    const m = {
      ...base,
      grammars: [
        { language: 'javascript', wasmFile: 'tree-sitter-javascript.wasm', source: { kind: 'npm', package: 'tree-sitter-javascript', version: '0.25.0', wasmPath: 'tree-sitter-javascript.wasm', nodeTypesPath: 'src/node-types.json' }, sha256: { wasm: hex('a'), nodeTypes: hex('b') } },
        { language: 'go', wasmFile: 'tree-sitter-go.wasm', repo: 'https://github.com/tree-sitter/tree-sitter-go', commit: '1'.repeat(40), source: { kind: 'github-release', url: 'https://github.com/tree-sitter/tree-sitter-go/releases/download/v1/tree-sitter-go.wasm' }, sha256: { wasm: hex('c'), nodeTypes: hex('d') } },
        { language: 'typescript', wasmFile: 'tree-sitter-typescript.wasm', repo: 'https://github.com/tree-sitter/tree-sitter-typescript', commit: '0'.repeat(40), cli: '0.27.0', abi: 15, source: { kind: 'source', dir: 'typescript', generate: true, patches: ['patches/x.patch'], deps: [{ path: 'node_modules/tree-sitter-javascript', repo: 'https://github.com/tree-sitter/tree-sitter-javascript', commit: '2'.repeat(40) }] }, sha256: { wasm: hex('e'), nodeTypes: hex('f') } },
      ],
    };
    assert.deepEqual(validateGrammarManifest(m), []);
  });

  test('invalid manifests list every problem', () => {
    const bad = {
      schema: 'runes-grammars/2',
      runtime: { package: 'web-tree-sitter', version: '^0.27.0' },
      grammars: [
        { language: 'go', wasmFile: 'go.wasm', source: { kind: 'npm', package: 'x', version: '1.0', wasmPath: '../x.wasm', nodeTypesPath: 'n.json' }, sha256: { wasm: 'nope', nodeTypes: hex('a') }, extra: 1 },
        { language: 'go', wasmFile: 'go.wasm', commit: 'abc', source: { kind: 'source', dir: '.', generate: 'yes', patches: ['../evil.patch'] }, sha256: { wasm: hex('a'), nodeTypes: hex('b') } },
        { language: 'x', wasmFile: 'x.wasm', source: { kind: 'github-release', url: 'http://insecure' }, sha256: { wasm: hex('a'), nodeTypes: hex('b') } },
        { language: 'y', wasmFile: 'y.wasm', source: { kind: 'ftp' }, sha256: { wasm: hex('a'), nodeTypes: hex('b') } },
      ],
    };
    const errors = validateGrammarManifest(bad);
    for (const expected of [
      'manifest.schema', 'manifest.runtime.version', 'manifest.runtime.wasmSha256', 'manifest.cli: missing', "manifest.grammars[0]: unknown key 'extra'", 'manifest.grammars[0].source.version', 'manifest.grammars[0].source.wasmPath', 'manifest.grammars[0].sha256.wasm',
      "manifest.grammars[1].language: duplicate 'go'", "manifest.grammars[1].wasmFile: duplicate 'go.wasm'", 'manifest.grammars[1].commit', 'manifest.grammars[1].source.generate', 'manifest.grammars[1].source.patches[0]', 'manifest.grammars[1].repo: required',
      'manifest.grammars[2].source.url', 'manifest.grammars[2].repo: required', 'manifest.grammars[2].commit: required', 'manifest.grammars[3].source.kind',
    ]) assert.ok(errors.some((e) => e.startsWith(expected)), `expected an error starting '${expected}' in:\n${errors.join('\n')}`);
    assert.throws(() => parseGrammarManifest(JSON.stringify(bad)), /invalid grammar manifest/);
  });

  test('a source build must name the manifest cli version', () => {
    const m = { ...base, grammars: [{ language: 'java', wasmFile: 'j.wasm', repo: 'https://x/y', commit: '0'.repeat(40), cli: '0.26.0', source: { kind: 'source', dir: '.', generate: false }, sha256: { wasm: hex('a'), nodeTypes: hex('b') } }] };
    assert.deepEqual(validateGrammarManifest(m), ["manifest.grammars[0].cli: a source build must name the manifest's cli.version (0.27.0)"]);
  });

  test('syntaxNodeTypesFile names the node-types.json beside a grammar', () => {
    assert.equal(syntaxNodeTypesFile('tree-sitter-c_sharp.wasm'), 'tree-sitter-c_sharp.node-types.json');
  });
});

describe('buildGrammars and verifyGrammarFiles', () => {
  const tmp = () => mkdtempSync(path.join(tmpdir(), 'runes-grammars-'));

  test('an npm pin is copied from the installed package and verified; a second run leaves the files alone', async () => {
    const out = tmp();
    try {
      const first = await buildGrammars({ outDir: out, only: ['javascript', 'go'], resolveFrom: root, offline: true, cacheDir: path.join(out, 'cache') });
      assert.deepEqual(first.map((b) => [b.language, b.from]), [['javascript', 'npm'], ['go', 'npm']]);
      assert.equal(sha(readFileSync(path.join(out, 'tree-sitter-go.wasm'))), byLanguage.get('go').sha256.wasm);
      assert.equal(sha(readFileSync(path.join(out, 'tree-sitter-go.node-types.json'))), byLanguage.get('go').sha256.nodeTypes);
      const second = await buildGrammars({ outDir: out, only: ['go'], resolveFrom: root, offline: true, cacheDir: path.join(out, 'cache') });
      assert.deepEqual(second.map((b) => b.from), ['out']);
      assert.deepEqual(verifyGrammarFiles(out, { only: ['javascript', 'go'] }), []);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('a cached pin is taken from the content-addressed cache; a damaged entry is evicted and offline mode then refuses', async () => {
    const out = tmp();
    const cache = path.join(out, 'cache');
    const pin = byLanguage.get('rust');
    try {
      mkdirSync(cache);
      const src = path.join(root, '.grammars');
      writeFileSync(path.join(cache, pin.sha256.wasm), readFileSync(path.join(src, pin.wasmFile)));
      writeFileSync(path.join(cache, pin.sha256.nodeTypes), readFileSync(path.join(src, syntaxNodeTypesFile(pin.wasmFile))));
      const built = await buildGrammars({ outDir: path.join(out, 'g'), only: ['rust'], resolveFrom: root, offline: true, cacheDir: cache });
      assert.deepEqual(built.map((b) => b.from), ['cache']);
      writeFileSync(path.join(cache, pin.sha256.wasm), 'damaged');
      const logs = [];
      await assert.rejects(buildGrammars({ outDir: path.join(out, 'h'), only: ['rust'], resolveFrom: root, offline: true, cacheDir: cache, log: (l) => logs.push(l) }), /not in the cache .* offline/);
      assert.ok(logs.some((l) => l.includes('evicted a damaged cache entry')));
      assert.ok(!existsSync(path.join(cache, pin.sha256.wasm)));
      assert.ok(!existsSync(path.join(out, 'h', pin.wasmFile)), 'nothing written for a failed pin');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('on Windows a source pin comes from the cache; a cold cache is refused with the reason, before any download or build', async () => {
    const out = tmp();
    const cache = path.join(out, 'cache');
    const pin = byLanguage.get('typescript');
    try {
      assert.equal(pin.source.kind, 'source');
      mkdirSync(cache);
      await assert.rejects(buildGrammars({ outDir: path.join(out, 'g'), only: ['typescript'], resolveFrom: root, cacheDir: cache, platform: 'win32' }), /typescript is not in the cache .* does not work on Windows: .* Linux, macOS or WSL/);
      assert.ok(!existsSync(path.join(out, 'g')), 'nothing written');
      const src = path.join(root, '.grammars');
      writeFileSync(path.join(cache, pin.sha256.wasm), readFileSync(path.join(src, pin.wasmFile)));
      writeFileSync(path.join(cache, pin.sha256.nodeTypes), readFileSync(path.join(src, syntaxNodeTypesFile(pin.wasmFile))));
      const built = await buildGrammars({ outDir: path.join(out, 'g'), only: ['typescript'], resolveFrom: root, cacheDir: cache, platform: 'win32' });
      assert.deepEqual(built.map((b) => b.from), ['cache']);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('a pin whose bytes differ fails before anything is written, and verifyGrammarFiles names the mismatch', async () => {
    const out = tmp();
    try {
      const m = structuredClone(manifest);
      const go = m.grammars.find((g) => g.language === 'go');
      go.sha256.wasm = hex('0');
      await assert.rejects(buildGrammars({ outDir: out, manifest: m, only: ['javascript', 'go'], resolveFrom: root, offline: true }), /grammar pin mismatch for go \(wasm\)/);
      assert.deepEqual(readdirSync(out), [], 'a failing pin leaves no partial set behind');
      cpSync(path.join(root, '.grammars', 'tree-sitter-go.wasm'), path.join(out, 'tree-sitter-go.wasm'));
      const problems = verifyGrammarFiles(out, { only: ['go'], manifest: m });
      assert.deepEqual(problems.map((p) => [p.file, p.problem]), [['tree-sitter-go.wasm', 'mismatch'], ['tree-sitter-go.node-types.json', 'missing']]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('an npm package at another version than its pin is refused', async () => {
    const out = tmp();
    try {
      const m = structuredClone(manifest);
      m.grammars.find((g) => g.language === 'python').source.version = '0.24.0';
      await assert.rejects(buildGrammars({ outDir: out, manifest: m, only: ['python'], resolveFrom: root, offline: true }), /tree-sitter-python@0\.25\.0 is installed, but its pin is 0\.24\.0/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('--only with a language the manifest does not pin is an error', async () => {
    await assert.rejects(buildGrammars({ outDir: tmp(), only: ['cobol'], resolveFrom: root, offline: true }), /pins no grammar for: cobol/);
  });

  test('the grammars the tests parse with are the pinned bytes', () => {
    assert.deepEqual(verifyGrammarFiles(path.join(root, '.grammars'), { only: Object.keys(LANGUAGES) }), []);
  });
});
