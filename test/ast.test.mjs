import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as TreeSitter from 'web-tree-sitter';
import { createParserHost, fileSha256, walk, closest } from '@chrisdudek/runes/ast';
import { kotlinExtractor, kotlinView } from '@chrisdudek/runes/relations';
import { GRAMMAR_DIR, host } from './helpers/tree-sitter.mjs';

const require = createRequire(import.meta.url);
const runtimeWasm = require.resolve('web-tree-sitter/web-tree-sitter.wasm');
const sha = (s) => createHash('sha256').update(s).digest('hex');

describe('createParserHost', () => {
  test('parses with the injected runtime and caches one parser per grammar', async () => {
    const tree = await host.parseFile('a/b.ts', 'import { x } from "./x";');
    try {
      assert.equal(tree.rootNode.type, 'program');
      assert.ok(tree instanceof TreeSitter.Tree, 'the tree comes from the injected runtime');
    } finally {
      tree.delete();
    }
    assert.equal(await host.getParser('.ts'), await host.getParser('.mts'));
    assert.equal(host.loadedParserFor('.ts'), await host.getParser('.ts'));
    assert.equal(host.loadedParserFor('.nope'), undefined);
    await assert.rejects(host.getParser('.nope'), /no parser for extension '\.nope'/);
  });

  test('a language override picks that language\'s grammar (a C++ header named .h)', async () => {
    const code = 'namespace a { class B {}; }';
    const has = (t, type) => t.rootNode.descendantsOfType(type).length > 0;
    assert.equal(await host.withParsedFile('x.h', code, (t) => has(t, 'namespace_definition')), false);
    assert.equal(await host.withParsedFile('x.h', code, (t) => has(t, 'namespace_definition'), 'cpp'), true);
  });

  test('concurrent first uses share one runtime init and one grammar load', async () => {
    // Moved from Yggdrasil's parser-concurrency.test.ts: without the memoized in-flight promises, concurrent callers each re-ran Parser.init() and Language.load(), and one could observe a half-loaded language.
    const calls = { init: 0, load: 0 };
    const runtime = {
      Parser: new Proxy(TreeSitter.Parser, { get: (target, key, receiver) => (key === 'init' ? (...a) => { calls.init++; return target.init(...a); } : Reflect.get(target, key, receiver)) }),
      Language: { load: (input) => { calls.load++; return TreeSitter.Language.load(input); } },
    };
    const fresh = createParserHost({ runtime, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    const parsers = await Promise.all(Array.from({ length: 24 }, () => fresh.getParser('.py')));
    assert.equal(new Set(parsers).size, 1);
    assert.equal(calls.load, 1, 'the grammar loads exactly once');
    assert.equal(calls.init, 1, 'the runtime initializes exactly once');
    await Promise.all([fresh.getParser('.py'), fresh.getParser('.go'), fresh.getParser('.go')]);
    assert.deepEqual(calls, { init: 1, load: 2 });
  });

  test('the grammar digest folds the runtime identity and the grammar bytes; the identity function runs once', () => {
    let calls = 0;
    const h = createParserHost({ runtime: TreeSitter, runtimeIdentity: () => { calls++; return 'id-1'; }, grammarDirs: [GRAMMAR_DIR] });
    const wasmHash = fileSha256(path.join(GRAMMAR_DIR, 'tree-sitter-go.wasm'));
    assert.equal(h.grammarWasmHash('.go'), wasmHash);
    assert.equal(h.grammarDigest('.go'), sha(`web-tree-sitter:id-1\ngrammar:${wasmHash}`));
    assert.equal(h.grammarDigestForLanguage('go'), h.grammarDigest('.go'));
    assert.equal(h.grammarDigestForLanguage('cobol'), undefined);
    h.grammarDigest('.py');
    assert.equal(calls, 1);
    const other = createParserHost({ runtime: TreeSitter, runtimeIdentity: 'id-2', grammarDirs: [GRAMMAR_DIR] });
    assert.notEqual(other.grammarDigest('.go'), h.grammarDigest('.go'), 'another runtime gives another digest');
    assert.equal(host.runtimeIdentity(), fileSha256(runtimeWasm));
    assert.equal(fileSha256(runtimeWasm), sha(readFileSync(runtimeWasm)));
  });

  test('a missing grammar names the directories searched', async () => {
    const h = createParserHost({ runtime: TreeSitter, runtimeIdentity: 'r', grammarDirs: ['/nowhere'] });
    await assert.rejects(h.getParser('.go'), /tree-sitter-go\.wasm not found in \/nowhere/);
    assert.throws(() => h.grammarWasmHash('.go'), /not found/);
  });

  test('a custom language table parses a language the Runes table does not have', async () => {
    const h = createParserHost({
      runtime: TreeSitter,
      runtimeIdentity: 'r',
      grammarDirs: [GRAMMAR_DIR],
      languages: { conf: { id: 'conf', extensions: ['.conf'], wasmFile: 'tree-sitter-toml.wasm', externalScanner: true, commentTypes: ['comment'], commentDelimiters: ['#'] } },
    });
    assert.equal(await h.withParsedFile('a.conf', 'a = 1\n', (t) => t.rootNode.type), 'document');
    await assert.rejects(h.getParser('.ts'), /no parser/);
  });

  test('newParser needs the runtime initialized first', async () => {
    const h = createParserHost({ runtime: TreeSitter, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    // The runtime is process-wide and already initialized by other tests, but this host has not awaited its own init.
    assert.throws(() => h.newParser(), /not initialized/);
    await h.getParser('.go');
    const p = h.newParser();
    assert.ok(p instanceof TreeSitter.Parser);
    p.delete();
  });
});

describe('walk and closest', () => {
  test('walk visits depth-first and a false return prunes the subtree; closest finds the nearest ancestor of a type', async () => {
    await host.withParsedFile('a.py', 'def f():\n    return g(1)\n', (tree) => {
      const seen = [];
      walk(tree.rootNode, (n) => { seen.push(n.type); return n.type !== 'return_statement'; });
      assert.ok(seen.includes('function_definition'));
      assert.ok(seen.includes('return_statement'));
      assert.ok(!seen.includes('call'), 'pruned below return_statement');
      let call;
      walk(tree.rootNode, (n) => { if (n.type === 'call') call = n; });
      assert.equal(closest(call, 'function_definition')?.type, 'function_definition');
      assert.equal(closest(call, ['module', 'class_definition'])?.type, 'module');
      assert.equal(closest(tree.rootNode, 'module'), null);
    });
  });
});

describe('the injected parser factory in Kotlin recovery', () => {
  const damaged = 'package p\ncontext(l: Logger)\nfun d() {}\nclass After\n';

  test('a damaged Kotlin file without a parser factory throws instead of skipping recovery', async () => {
    await host.withParsedFile('a.kt', damaged, (tree) => {
      assert.throws(() => kotlinView(tree, damaged), /recovery needs a parser/);
      assert.throws(() => kotlinExtractor.declarations({ path: 'a.kt', content: damaged, tree, language: 'kotlin' }), /ParsedFile\.newParser/);
      const keys = kotlinExtractor.declarations({ path: 'a.kt', content: damaged, tree, language: 'kotlin', newParser: host.newParser }).map((d) => d.symbolKey);
      assert.ok(keys.includes('p.After'), keys.join(', '));
    });
  });

  test('a clean Kotlin file needs no parser factory', async () => {
    const clean = 'package p\nclass A\n';
    await host.withParsedFile('a.kt', clean, (tree) => {
      assert.deepEqual(kotlinExtractor.declarations({ path: 'a.kt', content: clean, tree, language: 'kotlin' }).map((d) => d.symbolKey), ['p.A']);
    });
  });
});

test('no module of the package imports web-tree-sitter by value', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const dist = path.join(path.dirname(require.resolve('@chrisdudek/runes/package.json')), 'dist');
  const files = [];
  const visit = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) visit(p); else if (p.endsWith('.mjs')) files.push(p); } };
  visit(dist);
  const offenders = files.filter((f) => /(?:from|import)\s*\(?\s*['"]web-tree-sitter['"]/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
  assert.ok(files.length > 10);
});
