import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, readdirSync, mkdirSync, cpSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadGrammarManifest, buildGrammars, verifyGrammarFiles, LANGUAGES, EXTENSION_TO_LANGUAGE,
  grammarExtensionForPath, getLanguageForExtension, relationLanguageForPath, primaryExtensionForLanguage, getGrammarForExtension, getLanguageDisplayName,
} from '@chrisdudek/runes/grammars';
import { makeTempRepo } from '@chrisdudek/runes/testkit';
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

  // A source pin built end to end, with the real git steps and a stand-in for tree-sitter-cli: the grammar repository is checked out at the pinned commit, patched, its dependency checked out beside it, generated and built, and the bytes verified and cached.
  test('a source pin is checked out, patched, given its deps, generated, built, verified and cached', { skip: process.platform === 'win32' && 'the stand-in CLI is a shell script, and Windows refuses source builds anyway' }, async () => {
    const out = tmp();
    const grammar = makeTempRepo({ files: { 'g/grammar.txt': 'rules v1\n' } });
    const dep = makeTempRepo({ files: { 'dep.txt': 'dep bytes\n' } });
    try {
      const patches = path.join(out, 'patches');
      mkdirSync(patches);
      grammar.write('g/grammar.txt', 'rules v2\n');
      writeFileSync(path.join(patches, 'fix.patch'), grammar.git('diff'));
      grammar.git('checkout', '--', '.');
      const commit = grammar.git('rev-parse', 'HEAD').trim();
      const depCommit = dep.git('rev-parse', 'HEAD').trim();
      // The stand-in: --version answers the pinned version; generate writes node-types.json; build concatenates the grammar and its dependency.
      const cliDir = path.join(out, 'proj', 'node_modules', 'tree-sitter-cli');
      mkdirSync(cliDir, { recursive: true });
      writeFileSync(path.join(cliDir, 'package.json'), JSON.stringify({ name: 'tree-sitter-cli', version: manifest.cli.version }));
      writeFileSync(path.join(cliDir, 'tree-sitter'), `#!/bin/sh\ncase "$1" in\n  --version) echo "tree-sitter ${manifest.cli.version} (stand-in)";;\n  generate) mkdir -p src && echo '{"generated":true}' > src/node-types.json;;\n  build) cat "$5/grammar.txt" "$5/../deps/x/dep.txt" > "$4";;\nesac\n`, { mode: 0o755 });
      const wasm = Buffer.from('rules v2\ndep bytes\n');
      const nodeTypes = Buffer.from('{"generated":true}\n');
      const m = { ...structuredClone(manifest), grammars: [{
        language: 'toy', wasmFile: 'tree-sitter-toy.wasm', repo: grammar.dir, commit, version: '1', cli: manifest.cli.version, abi: 15,
        source: { kind: 'source', dir: 'g', generate: true, patches: ['patches/fix.patch'], deps: [{ path: 'deps/x', repo: dep.dir, commit: depCommit }] },
        sha256: { wasm: sha(wasm), nodeTypes: sha(nodeTypes) },
      }] };
      const cache = path.join(out, 'cache');
      const logs = [];
      const built = await buildGrammars({ outDir: path.join(out, 'g1'), manifest: m, patchesRoot: out, resolveFrom: path.join(out, 'proj'), cacheDir: cache, log: (l) => logs.push(l) });
      assert.deepEqual(built.map((b) => [b.language, b.from]), [['toy', 'source']]);
      assert.deepEqual(readFileSync(path.join(out, 'g1', 'tree-sitter-toy.wasm')), wasm);
      assert.deepEqual(readFileSync(path.join(out, 'g1', 'tree-sitter-toy.node-types.json')), nodeTypes);
      assert.ok(logs.some((l) => l.includes(`building toy from ${grammar.dir} at ${commit}`)));
      assert.ok(existsSync(path.join(cache, sha(wasm))), 'the cache holds the build under its sha256');
      const again = await buildGrammars({ outDir: path.join(out, 'g2'), manifest: m, patchesRoot: out, resolveFrom: path.join(out, 'proj'), cacheDir: cache, offline: true });
      assert.deepEqual(again.map((b) => b.from), ['cache']);
      // rebuild ignores the cache and derives the bytes again.
      const audit = await buildGrammars({ outDir: path.join(out, 'g3'), manifest: m, patchesRoot: out, resolveFrom: path.join(out, 'proj'), cacheDir: cache, rebuild: true });
      assert.deepEqual(audit.map((b) => b.from), ['source']);
      // The stand-in at another version is refused before any build; no tree-sitter-cli at all is refused with what to install.
      writeFileSync(path.join(cliDir, 'tree-sitter'), '#!/bin/sh\necho "tree-sitter 0.1.0"\n', { mode: 0o755 });
      await assert.rejects(buildGrammars({ outDir: path.join(out, 'g4'), manifest: m, patchesRoot: out, resolveFrom: path.join(out, 'proj'), cacheDir: path.join(out, 'cold') }), /pins tree-sitter-cli 0\.27\.0, but 0\.1\.0 is installed/);
      mkdirSync(path.join(out, 'bare'));
      await assert.rejects(buildGrammars({ outDir: path.join(out, 'g5'), manifest: m, patchesRoot: out, resolveFrom: path.join(out, 'bare'), cacheDir: path.join(out, 'cold') }), /needs tree-sitter-cli 0\.27\.0 installed/);
    } finally {
      grammar.cleanup(); dep.cleanup();
      rmSync(out, { recursive: true, force: true });
    }
  });

  // A github-release pin downloads its WASM from the release and its node-types.json from the pinned commit; the fetch is stubbed, so the test needs no network.
  test('a github-release pin is downloaded with retries on a server error, never on a client error, and verified', async () => {
    const out = tmp();
    const real = globalThis.fetch;
    const wasm = Buffer.from('released wasm');
    const nodeTypes = Buffer.from('[]');
    const asked = [];
    const answers = [];
    globalThis.fetch = async (url) => {
      asked.push(String(url));
      const a = answers.shift() ?? 'ok';
      if (a === 'throw') throw new Error('socket hang up');
      if (typeof a === 'number') return new Response('no', { status: a });
      return new Response(String(url).endsWith('node-types.json') ? nodeTypes : wasm, { status: 200 });
    };
    try {
      const m = { ...structuredClone(manifest), grammars: [{
        language: 'toy', wasmFile: 'tree-sitter-toy.wasm', repo: 'https://github.com/example/tree-sitter-toy', commit: 'a'.repeat(40), version: '1', cli: 'x', abi: 15,
        source: { kind: 'github-release', url: 'https://github.com/example/tree-sitter-toy/releases/download/v1/tree-sitter-toy.wasm' },
        sha256: { wasm: sha(wasm), nodeTypes: sha(nodeTypes) },
      }] };
      answers.push(503, 'throw');
      const built = await buildGrammars({ outDir: path.join(out, 'g'), manifest: m, cacheDir: path.join(out, 'cache') });
      assert.deepEqual(built.map((b) => b.from), ['download']);
      assert.deepEqual(asked, [m.grammars[0].source.url, m.grammars[0].source.url, m.grammars[0].source.url, `https://raw.githubusercontent.com/example/tree-sitter-toy/${'a'.repeat(40)}/src/node-types.json`], 'a 503 and a network error are retried');
      asked.length = 0;
      answers.push(404);
      await assert.rejects(buildGrammars({ outDir: path.join(out, 'h'), manifest: m, cacheDir: path.join(out, 'cold') }), /grammar download failed: .*tree-sitter-toy\.wasm -> HTTP 404/);
      assert.equal(asked.length, 1, 'a 404 is not retried');
    } finally {
      globalThis.fetch = real;
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

describe('the language table', () => {
  test('grammarExtensionForPath: the extension of the file name, .rb for the extension-less Ruby files, nothing for a dotfile or no dot', () => {
    assert.equal(grammarExtensionForPath('src/a/B.Test.ts'), '.ts');
    assert.equal(grammarExtensionForPath('src\\win\\x.PY'), '.PY');
    assert.equal(grammarExtensionForPath('app/Rakefile'), '.rb');
    assert.equal(grammarExtensionForPath('Gemfile'), '.rb');
    assert.equal(grammarExtensionForPath('.eslintrc'), '');
    assert.equal(grammarExtensionForPath('Makefile'), '');
    assert.equal(grammarExtensionForPath(''), '');
  });

  test('getLanguageForExtension: case-insensitive, overrides first, never a key of Object.prototype', () => {
    assert.equal(getLanguageForExtension('.TS'), 'typescript');
    assert.equal(getLanguageForExtension('.h'), 'c');
    assert.equal(getLanguageForExtension('.h', { '.h': 'cpp' }), 'cpp');
    assert.equal(getLanguageForExtension('.xyz'), null);
    assert.equal(getLanguageForExtension('constructor'), null);
    assert.equal(getLanguageForExtension('toString', {}), null);
    for (const [ext, lang] of Object.entries(EXTENSION_TO_LANGUAGE)) assert.ok(LANGUAGES[lang].extensions.includes(ext), `${ext} → ${lang}`);
  });

  test('relationLanguageForPath: a .h is C++ when its directory holds C++ sources and no .c; every other file keeps its extension', () => {
    let asked = 0;
    const names = (list) => () => { asked += 1; return list; };
    assert.equal(relationLanguageForPath('a/x.h', names(['x.cpp', 'y.hpp', 'README'])), 'cpp');
    assert.equal(relationLanguageForPath('a/x.h', names(['x.cpp', 'y.C', 'z.c'])), 'c');
    assert.equal(relationLanguageForPath('a/x.h', names(['.hidden', 'x.h'])), 'c');
    assert.equal(relationLanguageForPath('a/x.H', names(['x.cc'])), 'cpp');
    const before = asked;
    assert.equal(relationLanguageForPath('a/x.cpp', names(['x.c'])), 'cpp');
    assert.equal(relationLanguageForPath('a/x.go', names([])), 'go');
    assert.equal(relationLanguageForPath('a/x.unknown', names([])), null);
    assert.equal(asked, before, 'the directory is listed only for a .h');
  });

  test('primaryExtensionForLanguage, getGrammarForExtension and getLanguageDisplayName', () => {
    assert.equal(primaryExtensionForLanguage('cpp'), LANGUAGES.cpp.extensions[0]);
    assert.equal(primaryExtensionForLanguage('nope'), undefined);
    assert.equal(primaryExtensionForLanguage('toString'), undefined);
    assert.deepEqual(getGrammarForExtension('.RS'), { wasmFile: LANGUAGES.rust.wasmFile });
    assert.equal(getGrammarForExtension('.nope'), null);
    assert.equal(getLanguageDisplayName('typescript'), 'TypeScript');
    assert.equal(getLanguageDisplayName('csharp'), 'C#');
    assert.equal(getLanguageDisplayName('go'), 'Go');
    assert.equal(getLanguageDisplayName('madeup'), 'Madeup');
    assert.equal(getLanguageDisplayName(''), '');
    assert.equal(getLanguageDisplayName('constructor'), 'Constructor');
  });
});
