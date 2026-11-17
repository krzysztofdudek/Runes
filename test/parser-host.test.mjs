// Parser-host behaviour moved from Yggdrasil's tests/unit/ast (parser.test.ts, parser-concurrency.test.ts, grammar-pins.test.ts): every grammar of the language table loads and finds its comments by the table's commentTypes, loads with the ABI its pin records, a scanner trap poisons neither the next file nor concurrent callers, and a failed grammar load is evicted so a later call retries.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as TreeSitter from 'web-tree-sitter';
import { createParserHost } from '@chrisdudek/runes/ast';
import { LANGUAGES, loadGrammarManifest } from '@chrisdudek/runes/grammars';
import { GRAMMAR_DIR, host } from './helpers/tree-sitter.mjs';

describe('every grammar of the language table', () => {
  // Each grammar must load and parse a clean sample, and where the language has comments the table's commentTypes must find exactly the planted ones: a wrong value silently breaks comment scanning for that language.
  const CASES = [
    { ext: '.ts', lang: 'typescript', src: '// line\n/* block */\nconst x = 1;\n', comments: 2 },
    { ext: '.tsx', lang: 'tsx', src: '// line\nconst X = () => <div />;\n', comments: 1 },
    { ext: '.js', lang: 'javascript', src: '// line\n/* block */\nconst x = 1;\n', comments: 2 },
    { ext: '.py', lang: 'python', src: '# a comment\nx = 1  # trailing\n', comments: 2 },
    { ext: '.go', lang: 'go', src: 'package main\n// line\n/* block */\nfunc main() {}\n', comments: 2 },
    { ext: '.rs', lang: 'rust', src: '// line\n/* block */\nfn main() {}\n', comments: 2 },
    { ext: '.java', lang: 'java', src: '// line\n/* block */\nclass A {}\n', comments: 2 },
    { ext: '.cs', lang: 'csharp', src: '// line\n/* block */\nclass A {}\n', comments: 2 },
    { ext: '.c', lang: 'c', src: '// line\n/* block */\nint main() { return 0; }\n', comments: 2 },
    { ext: '.cpp', lang: 'cpp', src: '// line\n/* block */\nint main() { return 0; }\n', comments: 2 },
    { ext: '.php', lang: 'php', src: '<?php\n// line\n# hash\n/* block */\n$x = 1;\n', comments: 3 },
    { ext: '.rb', lang: 'ruby', src: '# a comment\nx = 1\n', comments: 1 },
    { ext: '.json', lang: 'json', src: '{"a": 1}\n', comments: 0 },
    { ext: '.kt', lang: 'kotlin', src: '// line\n/* block */\nfun main() {}\n', comments: 2 },
    { ext: '.yaml', lang: 'yaml', src: '# a comment\nkey: value\n', comments: 1 },
    { ext: '.toml', lang: 'toml', src: '# a comment\nkey = "value"\n', comments: 1 },
  ];

  it('the cases cover the whole table', () => {
    assert.deepEqual(CASES.map((c) => c.lang).sort(), Object.keys(LANGUAGES).sort());
  });

  for (const { ext, lang, src, comments } of CASES) {
    it(`parses ${ext} (${lang}) cleanly and its commentTypes find ${comments} comment(s)`, async () => {
      await host.withParsedFile(`foo${ext}`, src, (tree) => {
        assert.ok(tree.rootNode.childCount > 0);
        assert.equal(tree.rootNode.hasError, false);
        const found = LANGUAGES[lang].commentTypes.flatMap((t) => tree.rootNode.descendantsOfType(t));
        assert.equal(found.length, comments);
      });
    });
  }

  const pins = new Map(loadGrammarManifest().grammars.map((g) => [g.language, g]));
  for (const def of Object.values(LANGUAGES)) {
    it(`${def.id}: loads on the pinned runtime with the ABI its pin records`, async () => {
      await TreeSitter.Parser.init();
      const lang = await TreeSitter.Language.load(path.join(GRAMMAR_DIR, def.wasmFile));
      assert.equal(typeof pins.get(def.id)?.abi, 'number', `the ${def.id} pin records no abi`);
      assert.equal(lang.abiVersion, pins.get(def.id).abi);
    });
  }
});

describe('failure isolation', () => {
  it('a parse that traps the grammar scanner fails only on that parser: the file is retried on a fresh one, the poisoned parser leaves the cache, the next file parses', async () => {
    // A grammar's external scanner can trap on one pathological input (tree-sitter-ruby on a 256+ character heredoc delimiter did), and the trap leaves that parser unusable: every later parse on it throws. The pinned Ruby grammar no longer traps, so the trap is simulated: the first parser the runtime makes throws on every parse.
    let made = 0;
    let poisoned;
    const PoisonParser = new Proxy(TreeSitter.Parser, {
      construct(target, args) {
        const p = Reflect.construct(target, args);
        if (made++ === 0) {
          poisoned = p;
          p.parse = () => { throw new Error('RuntimeError: unreachable (scanner trap)'); };
        }
        return p;
      },
    });
    const h = createParserHost({ runtime: { Parser: PoisonParser, Language: TreeSitter.Language }, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    assert.equal(await h.withParsedFile('bad.rb', 'x = 1\n', (tree) => tree.rootNode.type), 'program', 'the trapped file is retried on a fresh parser');
    assert.ok(poisoned, 'the first parser was the poisoned one');
    assert.notEqual(h.loadedParserFor('.rb'), poisoned, 'the poisoned parser left the cache');
    await h.withParsedFile('next.rb', 'y = Flag', (tree) => {
      assert.equal(tree.rootNode.type, 'program');
      assert.equal(tree.rootNode.text, 'y = Flag');
    });
    const outcomes = await Promise.all(['a = One', 'b = Two'].map((code, i) => h.withParsedFile(`f${i}.rb`, code, (tree) => tree.rootNode.type)));
    assert.deepEqual(outcomes, ['program', 'program']);
  });

  it('a failed grammar load is evicted so a later call retries', async () => {
    let failNext = true;
    const runtime = {
      Parser: TreeSitter.Parser,
      Language: {
        load: (input) => {
          if (failNext) { failNext = false; return Promise.reject(new Error('transient wasm read error')); }
          return TreeSitter.Language.load(input);
        },
      },
    };
    const h = createParserHost({ runtime, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    await assert.rejects(h.getParser('.rb'), /transient wasm read error/);
    assert.ok(await h.getParser('.rb'));
    assert.ok((await h.withParsedFile('x.rb', 'x = 1\n', (tree) => tree.rootNode.childCount)) > 0);
  });

  it('a big concurrent burst across several grammars all parse cleanly (no version-0 error)', async () => {
    const h = createParserHost({ runtime: TreeSitter, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    const samples = [['a.ts', 'const x = 1;'], ['b.py', 'x = 1\n'], ['c.go', 'package main\nfunc main() {}\n'], ['d.rs', 'fn main() {}\n'], ['e.java', 'class A {}\n']];
    const counts = await Promise.all(Array.from({ length: 40 }, (_, i) => {
      const [file, src] = samples[i % samples.length];
      return h.withParsedFile(`${i}-${file}`, src, (tree) => tree.rootNode.childCount);
    }));
    assert.equal(counts.length, 40);
    for (const c of counts) assert.ok(c > 0);
  });

  it('an extension no language owns is refused', async () => {
    await assert.rejects(host.withParsedFile('foo.swift', 'let x = 1', () => {}), /no parser for extension/);
    assert.throws(() => host.grammarWasmHash('.swift'), /no grammar for extension/);
  });
});

describe('a parse stopped by its progress callback', () => {
  // a<a, repeated is TypeScript the grammar cannot settle: its parse grows its memory about fourfold per doubling (some 450 MiB at 16 KiB), so a consumer needs a way to stop it. Each test stops it at the runtime's first progress call.
  const PATHOLOGICAL = 'a<a,'.repeat(4096);
  const NEXT = 'const b: number = 2;\n';
  const nextIsWhole = (h) => h.withParsedFile('next.ts', NEXT, (tree) => {
    assert.equal(tree.rootNode.type, 'program');
    assert.equal(tree.rootNode.hasError, false);
    assert.equal(tree.rootNode.text, NEXT);
  });

  for (const call of ['withParsedFile', 'parseFile']) {
    it(`${call} rejects without a tree when the callback returns true, and the next parse on the same host is whole`, async () => {
      const h = createParserHost({ runtime: TreeSitter, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
      let progressCalls = 0;
      let fnRan = false;
      const options = { progressCallback: () => { progressCalls++; return true; } };
      const attempt = call === 'withParsedFile'
        ? h.withParsedFile('shape.ts', PATHOLOGICAL, () => { fnRan = true; }, undefined, options)
        : h.parseFile('shape.ts', PATHOLOGICAL, undefined, options);
      await assert.rejects(attempt, (error) => error.code === 'EPARSESTOPPED' && error.message.includes('shape.ts'));
      assert.equal(progressCalls, 1, 'stopped at the first call');
      assert.equal(fnRan, false, 'no tree reached fn');
      await nextIsWhole(h);
    });
  }

  it('a callback that throws stops the parse: the call rejects with what it threw, and the next parse on the same host is whole', async () => {
    const h = createParserHost({ runtime: TreeSitter, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    const thrown = new Error('budget check failed');
    await assert.rejects(h.withParsedFile('shape.ts', PATHOLOGICAL, () => {}, undefined, { progressCallback: () => { throw thrown; } }), (error) => error === thrown);
    await nextIsWhole(h);
  });

  it('a callback that never returns true lets the parse finish, and gets the runtime parse state', async () => {
    const h = createParserHost({ runtime: TreeSitter, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    const states = [];
    const text = await h.withParsedFile('a.ts', NEXT, (tree) => tree.rootNode.text, undefined, { progressCallback: (state) => { states.push(state); return false; } });
    assert.equal(text, NEXT);
    for (const state of states) assert.equal(typeof state.currentOffset, 'number');
  });

  it('without the option no progress callback reaches the runtime; with it, one does', async () => {
    // A stub runtime records what each parse is given, so the default parse is seen to stay the runtime's plain parse.
    const seen = [];
    class StubParser {
      static init() { return Promise.resolve(); }
      setLanguage() {}
      parse(...args) { seen.push(args); return { rootNode: { type: 'program' }, delete() {} }; }
      reset() {}
      delete() {}
    }
    const h = createParserHost({ runtime: { Parser: StubParser, Language: { load: async () => ({}) } }, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    assert.equal(await h.withParsedFile('a.ts', 'x', (tree) => tree.rootNode.type), 'program');
    (await h.parseFile('b.ts', 'y')).delete();
    assert.deepEqual(seen.map((args) => args[2]?.progressCallback), [undefined, undefined]);
    (await h.parseFile('c.ts', 'z', undefined, { progressCallback: () => false })).delete();
    assert.equal(typeof seen[2][2]?.progressCallback, 'function');
  });
});
