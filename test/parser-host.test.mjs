// Parser-host behaviour moved from Yggdrasil's tests/unit/ast (parser.test.ts, parser-concurrency.test.ts, grammar-pins.test.ts): every grammar of the language table loads and finds its comments by the table's commentTypes, loads with the ABI its pin records, a scanner trap poisons neither the next file nor concurrent callers, and a failed grammar load is evicted so a later call retries.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
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
  // A stopped parse left on its parser resumes on that parser's next call, whatever text it is given: the next file then gets the stopped file's tree. So the next tree is compared with the one a host that never stopped gives.
  const nextIsWhole = async (h) => {
    const expected = await createParserHost({ runtime: TreeSitter, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] }).withParsedFile('next.ts', NEXT, (tree) => tree.rootNode.toString());
    assert.match(expected, /^\(program \(lexical_declaration /);
    await h.withParsedFile('next.ts', NEXT, (tree) => {
      assert.equal(tree.rootNode.toString(), expected);
      assert.equal(tree.rootNode.hasError, false);
    });
  };

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

  it('options passed where the language goes are refused, not taken for a language', async () => {
    const h = createParserHost({ runtime: TreeSitter, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    const options = { progressCallback: () => true };
    await assert.rejects(h.parseFile('shape.ts', PATHOLOGICAL, options), TypeError);
    await assert.rejects(h.withParsedFile('shape.ts', PATHOLOGICAL, () => {}, options), TypeError);
    await nextIsWhole(h);
  });

  it('null where the language goes still means no language, as in 1.1, and the options after it still apply', async () => {
    const h = createParserHost({ runtime: TreeSitter, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    const tree = await h.parseFile('next.ts', NEXT, null);
    try {
      assert.equal(tree.rootNode.text, NEXT);
      assert.equal(tree.rootNode.hasError, false);
    } finally {
      tree.delete();
    }
    await assert.rejects(h.withParsedFile('shape.ts', PATHOLOGICAL, () => {}, null, { progressCallback: () => true }), (error) => error.code === 'EPARSESTOPPED');
    await nextIsWhole(h);
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
    assert.deepEqual(seen, [['x'], ['y']], 'the runtime is called exactly as before');
    (await h.parseFile('c.ts', 'z', undefined, { progressCallback: () => false })).delete();
    assert.equal(typeof seen[2][2]?.progressCallback, 'function');
  });
});

describe('a parse the runtime aborts', () => {
  // The runtime aborts at its 2 GiB memory limit (a C# file of `int x = f(a < b, a < b, …` at 32 KiB on web-tree-sitter 0.27.2) with a RuntimeError whose message starts `Aborted(`; afterwards the runtime is damaged for the whole process. A stub runtime aborts on every parse, so the abort is seen without spending 2 GiB.
  const abortingRuntime = (parses) => {
    class AbortingParser {
      static init() { return Promise.resolve(); }
      setLanguage() {}
      parse(content, _old, options) {
        parses.push(content);
        options?.progressCallback?.({ currentOffset: 2, hasError: false });
        throw new WebAssembly.RuntimeError('Aborted(). Build with -sASSERTIONS for more info.');
      }
      reset() {}
      delete() {}
    }
    return { Parser: AbortingParser, Language: { load: async () => ({}) } };
  };

  it('is not retried as a scanner trap: the call rejects with ERUNTIMEABORTED, and every later parse on the host rejects the same way without reaching the runtime', async () => {
    const parses = [];
    const h = createParserHost({ runtime: abortingRuntime(parses), runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    await assert.rejects(h.withParsedFile('a.cs', 'x', () => {}), (error) => error.code === 'ERUNTIMEABORTED' && error.message.includes('a.cs'));
    assert.deepEqual(parses, ['x'], 'parsed once, never retried');
    await assert.rejects(h.parseFile('b.ts', 'y'), (error) => error.code === 'ERUNTIMEABORTED');
    assert.deepEqual(parses, ['x'], 'the spent host does not reach the runtime again');
  });

  it('calls already in flight when the runtime aborts do not reach it: each rejects with ERUNTIMEABORTED naming the file that aborted', async () => {
    // The grammar load resolves after a turn of the event loop, so all five calls are waiting for their parser when the first one parses and aborts.
    const parses = [];
    class SometimesAbortingParser {
      static init() { return Promise.resolve(); }
      setLanguage() {}
      parse(content) {
        parses.push(content);
        if (content === 'abort') throw new WebAssembly.RuntimeError('Aborted(). Build with -sASSERTIONS for more info.');
        return { rootNode: { type: 'program' }, delete() {} };
      }
      reset() {}
      delete() {}
    }
    const runtime = { Parser: SometimesAbortingParser, Language: { load: () => new Promise((resolve) => setTimeout(() => resolve({}), 5)) } };
    const h = createParserHost({ runtime, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    const files = [['a.cs', 'abort'], ['b.cs', 'one'], ['c.cs', 'two'], ['d.ts', 'three'], ['e.cs', 'four']];
    const outcomes = await Promise.allSettled(files.map(([file, content]) => h.withParsedFile(file, content, (tree) => tree.rootNode.type)));
    assert.deepEqual(parses, ['abort'], 'only the aborting parse reached the runtime');
    for (const [i, outcome] of outcomes.entries()) {
      assert.equal(outcome.status, 'rejected', `${files[i][0]} got no tree`);
      assert.equal(outcome.reason.code, 'ERUNTIMEABORTED');
      assert.match(outcome.reason.message, /while parsing a\.cs/);
    }
    await assert.rejects(h.parseFile('f.cs', 'five'), (error) => error.code === 'ERUNTIMEABORTED' && /while parsing a\.cs/.test(error.message));
    assert.deepEqual(parses, ['abort']);
  });

  it('an abort on the retry after a scanner trap is caught the same way', async () => {
    const parses = [];
    class TrapThenAbortParser {
      static init() { return Promise.resolve(); }
      setLanguage() {}
      parse(content) {
        parses.push(content);
        throw new WebAssembly.RuntimeError(parses.length === 1 ? 'unreachable' : 'Aborted(). Build with -sASSERTIONS for more info.');
      }
      reset() {}
      delete() {}
    }
    const h = createParserHost({ runtime: { Parser: TrapThenAbortParser, Language: { load: async () => ({}) } }, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    await assert.rejects(h.parseFile('a.rb', 'x'), (error) => error.code === 'ERUNTIMEABORTED' && /while parsing a\.rb/.test(error.message));
    assert.deepEqual(parses, ['x', 'x'], 'the trap was retried once, and the retry aborted');
    await assert.rejects(h.parseFile('b.rb', 'y'), (error) => error.code === 'ERUNTIMEABORTED');
    assert.deepEqual(parses, ['x', 'x'], 'the spent host does not reach the runtime again');
  });

  // A stub runtime that logs every call made into it, and after an abort fails as the damaged runtime does ('table index is out of bounds'). Grammars other than C# and Ruby load after a timer, so a call can be waiting for its grammar when another call aborts.
  const loggingRuntime = (events) => {
    let aborted = false;
    let trapped = false;
    const damaged = () => new WebAssembly.RuntimeError('table index is out of bounds');
    class LoggingParser {
      static init() { return Promise.resolve(); }
      constructor() {
        events.push('new Parser');
        if (aborted) throw damaged();
      }
      setLanguage() {}
      parse(content) {
        events.push(`parse ${content}`);
        if (content === 'abort') {
          aborted = true;
          events.push('ABORT');
          throw new WebAssembly.RuntimeError('Aborted(). Build with -sASSERTIONS for more info.');
        }
        if (content === 'trap' && !trapped) {
          trapped = true;
          throw new WebAssembly.RuntimeError('unreachable');
        }
        return { rootNode: { type: 'program' }, delete() {} };
      }
      reset() {}
      delete() {}
    }
    const load = (input) => {
      const name = path.basename(String(input));
      events.push(`load ${name}`);
      if (/c_sharp|ruby/.test(name)) return Promise.resolve({});
      return new Promise((resolve, reject) => setTimeout(() => (aborted && /python/.test(name) ? reject(damaged()) : resolve({})), 5));
    };
    return { Parser: LoggingParser, Language: { load } };
  };
  const after = (events, mark) => events.slice(events.indexOf(mark) + 1);

  it('a call in flight when another call aborts makes no parser on the runtime and rejects with ERUNTIMEABORTED naming the file that aborted', async () => {
    const events = [];
    const h = createParserHost({ runtime: loggingRuntime(events), runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    await h.getParser('.cs');
    const files = [['a.cs', 'abort'], ['c.cs', 'four'], ['b.ts', 'one'], ['d.py', 'two'], ['e.ts', 'three']];
    const outcomes = await Promise.allSettled(files.map(([file, content]) => h.withParsedFile(file, content, (tree) => tree.rootNode.type)));
    assert.ok(events.includes('ABORT'));
    assert.deepEqual(after(events, 'ABORT'), [], 'nothing reached the runtime after the abort');
    for (const [i, outcome] of outcomes.entries()) {
      assert.equal(outcome.status, 'rejected', `${files[i][0]} got no tree`);
      assert.equal(outcome.reason.code, 'ERUNTIMEABORTED', `${files[i][0]}: ${outcome.reason.message}`);
      assert.match(outcome.reason.message, /while parsing a\.cs/);
      if (i > 0) assert.match(outcome.reason.message, new RegExp(`${files[i][0].replace('.', '\\.')} was not parsed`));
    }
  });

  it('a scanner trap is retried before any other call runs, so no abort can come between a trap and its retry', async () => {
    const events = [];
    const h = createParserHost({ runtime: loggingRuntime(events), runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    await h.getParser('.rb');
    const [trapped, aborting] = await Promise.allSettled([
      h.withParsedFile('t.rb', 'trap', (tree) => tree.rootNode.type),
      h.withParsedFile('a.rb', 'abort', (tree) => tree.rootNode.type),
    ]);
    assert.deepEqual(events.filter((e) => e.startsWith('parse') || e === 'ABORT'), ['parse trap', 'parse trap', 'parse abort', 'ABORT'], 'the retry ran before the other call parsed');
    assert.equal(trapped.reason.code, 'ERUNTIMEABORTED');
    assert.match(trapped.reason.message, /t\.rb was parsed, but its function was not called/, 'the retry gave t.rb its tree; the abort then came before its function');
    assert.equal(aborting.reason.code, 'ERUNTIMEABORTED');
  });

  it('after an abort, getParser (a held parser too), loadGrammarsFor and newParser refuse with ERUNTIMEABORTED and make no runtime call', async () => {
    const events = [];
    const h = createParserHost({ runtime: loggingRuntime(events), runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    await assert.rejects(h.parseFile('a.cs', 'abort'), (error) => error.code === 'ERUNTIMEABORTED');
    const mark = events.length;
    await assert.rejects(h.getParser('.ts'), (error) => error.code === 'ERUNTIMEABORTED' && /while parsing a\.cs/.test(error.message));
    await assert.rejects(h.getParser('.cs'), (error) => error.code === 'ERUNTIMEABORTED', 'not even the parser the host already holds');
    await assert.rejects(h.loadGrammarsFor(['.py']), (error) => error.code === 'ERUNTIMEABORTED');
    assert.throws(() => h.newParser(), (error) => error.code === 'ERUNTIMEABORTED');
    assert.deepEqual(events.slice(mark), []);
  });

  it('after an abort, loadedParserFor returns undefined, also for a parser the host held before the abort', async () => {
    const events = [];
    const h = createParserHost({ runtime: loggingRuntime(events), runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    await h.getParser('.cs');
    assert.ok(h.loadedParserFor('.cs'), 'the C# parser is held before the abort');
    await assert.rejects(h.parseFile('a.cs', 'abort'), (error) => error.code === 'ERUNTIMEABORTED');
    assert.equal(h.loadedParserFor('.cs'), undefined);
  });

  it('a throw that is no abort is still taken for a scanner trap: retried once on a fresh parser, and the host stays usable', async () => {
    const parses = [];
    class TrappingParser {
      static init() { return Promise.resolve(); }
      setLanguage() {}
      parse(content) { parses.push(content); throw new WebAssembly.RuntimeError('unreachable'); }
      reset() {}
      delete() {}
    }
    const h = createParserHost({ runtime: { Parser: TrappingParser, Language: { load: async () => ({}) } }, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    await assert.rejects(h.parseFile('a.rb', 'x'), (error) => error.message === 'unreachable' && error.code === undefined);
    assert.deepEqual(parses, ['x', 'x'], 'retried once');
    await assert.rejects(h.parseFile('b.rb', 'y'), /unreachable/);
    assert.deepEqual(parses, ['x', 'x', 'y', 'y'], 'the next call reaches the runtime');
  });

  it('with a progress callback that asks to stop, an abort still rejects with ERUNTIMEABORTED, not EPARSESTOPPED', async () => {
    const parses = [];
    const h = createParserHost({ runtime: abortingRuntime(parses), runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    await assert.rejects(h.parseFile('a.cs', 'x', undefined, { progressCallback: () => true }), (error) => error.code === 'ERUNTIMEABORTED');
    assert.deepEqual(parses, ['x']);
  });
});

// Making a parser, setting its language, freeing a tree or a parser and resetting a parser take a little of the runtime's memory too, so each can abort as a parse does. A stub runtime logs every call made into it: a parse of 'abort' aborts, `aborts` names one more call that aborts ('new Parser', 'set language', 'reset', 'parser delete' or 'tree delete'), on its `nth` time, `fails` one that throws an error that is no abort, and with `trapFirst` the first parse traps, so the host retries on a fresh parser. With `collects`, its parsers and trees register with a FinalizationRegistry and leave it on delete, as web-tree-sitter 0.27.2's do, whose callback frees them on the runtime; here it logs `finalize <what>` instead, and `witness()` registers an object nobody holds, to see that a collection ran.
const freeingRuntime = (events, { aborts, fails, nth = 1, trapFirst = false, collects = false } = {}) => {
  let parses = 0;
  let made = 0;
  const counts = new Map();
  const registry = collects ? new FinalizationRegistry((what) => events.push(`finalize ${what}`)) : undefined;
  const call = (kind, label = kind) => {
    events.push(label);
    if (kind === fails) throw new Error(`${kind} failed`);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (kind === aborts && counts.get(kind) === nth) {
      events.push('ABORT');
      throw new WebAssembly.RuntimeError('Aborted(). Build with -sASSERTIONS for more info.');
    }
  };
  class FreeingParser {
    static init() { return Promise.resolve(); }
    constructor() {
      call('new Parser');
      registry?.register(this, `parser ${++made}`, this);
    }
    setLanguage() { call('set language'); }
    parse(content, _old, options) {
      events.push(`parse ${content}`);
      if (trapFirst && parses++ === 0) throw new WebAssembly.RuntimeError('unreachable');
      if (content === 'abort') {
        events.push('ABORT');
        throw new WebAssembly.RuntimeError('Aborted(). Build with -sASSERTIONS for more info.');
      }
      if (options?.progressCallback?.({ currentOffset: 2, hasError: false }) === true) return null;
      const tree = { rootNode: { type: 'program' }, delete: () => { registry?.unregister(tree); call('tree delete', `tree delete ${content}`); } };
      registry?.register(tree, `tree ${content}`, tree);
      return tree;
    }
    reset() { call('reset'); }
    delete() {
      registry?.unregister(this);
      call('parser delete');
    }
  }
  return { Parser: FreeingParser, Language: { load: async () => ({}) }, witness: () => registry?.register({}, 'witness') };
};
const hostOver = (events, script) => createParserHost({ runtime: freeingRuntime(events, script), runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
const abortError = () => new WebAssembly.RuntimeError('Aborted(). Build with -sASSERTIONS for more info.');
const after = (events, mark) => events.slice(events.indexOf(mark) + 1);

describe('freeing and resetting around a runtime abort', () => {
  const STOP = { progressCallback: () => true };
  const refusesLaterCalls = async (h, events, first) => {
    const mark = events.length;
    await assert.rejects(h.parseFile('later.cs', 'y'), (error) => error.code === 'ERUNTIMEABORTED' && error.message.includes(first));
    await assert.rejects(h.withParsedFile('later.rb', 'z', () => 'unreached'), (error) => error.code === 'ERUNTIMEABORTED');
    assert.deepEqual(events.slice(mark), [], 'a later call does not reach the runtime');
  };

  it('a tree whose delete aborts in withParsedFile: the call rejects with ERUNTIMEABORTED instead of the function\'s result, and later calls are refused without reaching the runtime', async () => {
    const events = [];
    const h = hostOver(events, { aborts: 'tree delete' });
    await assert.rejects(h.withParsedFile('a.cs', 'x', (tree) => tree.rootNode.type), (error) => error.code === 'ERUNTIMEABORTED' && /while freeing the tree of a\.cs/.test(error.message) && error.cause instanceof WebAssembly.RuntimeError);
    assert.deepEqual(after(events, 'ABORT'), []);
    await refusesLaterCalls(h, events, 'while freeing the tree of a.cs');
  });

  it('a tree held by withParsedFile when another call aborts is not freed, and the function\'s result stands', async () => {
    const events = [];
    const h = hostOver(events);
    await h.getParser('.cs');
    let release;
    let started;
    const gate = new Promise((resolve) => { release = resolve; });
    const running = new Promise((resolve) => { started = resolve; });
    const holding = h.withParsedFile('b.cs', 'one', async (tree) => { started(); await gate; return tree.rootNode.type; });
    await running;
    await assert.rejects(h.parseFile('a.cs', 'abort'), (error) => error.code === 'ERUNTIMEABORTED');
    release();
    assert.equal(await holding, 'program');
    assert.ok(events.includes('parse one'));
    assert.deepEqual(after(events, 'ABORT'), [], 'the tree of b.cs was not freed on the damaged runtime');
    await refusesLaterCalls(h, events, 'while parsing a.cs');
  });

  it('a function that was running when another call aborted, and then throws an abort of its own, is told its file was parsed', async () => {
    const events = [];
    const h = hostOver(events);
    await h.getParser('.cs');
    let release;
    let started;
    const gate = new Promise((resolve) => { release = resolve; });
    const running = new Promise((resolve) => { started = resolve; });
    const holding = h.withParsedFile('b.cs', 'one', async () => { started(); await gate; throw abortError(); });
    await running;
    await assert.rejects(h.parseFile('a.cs', 'abort'), (error) => error.code === 'ERUNTIMEABORTED');
    release();
    await assert.rejects(holding, (error) => error.code === 'ERUNTIMEABORTED' && /earlier, while parsing a\.cs, so b\.cs was parsed, but its function failed on the damaged runtime/.test(error.message));
    assert.deepEqual(after(events, 'ABORT'), [], 'the tree of b.cs was not freed on the damaged runtime');
  });

  it('an abort on the retry after a scanner trap leaves the retry parser unfreed', async () => {
    const events = [];
    const h = hostOver(events, { trapFirst: true });
    await assert.rejects(h.parseFile('a.rb', 'abort'), (error) => error.code === 'ERUNTIMEABORTED' && /while parsing a\.rb/.test(error.message));
    assert.deepEqual(events.filter((e) => e.startsWith('parse ')), ['parse abort', 'parse abort'], 'the trap was retried once, and the retry aborted');
    assert.deepEqual(after(events, 'ABORT'), []);
    await refusesLaterCalls(h, events, 'while parsing a.rb');
  });

  it('a retry parser whose delete aborts: the call rejects with ERUNTIMEABORTED, the retry\'s tree is not freed, and later calls are refused without reaching the runtime', async () => {
    const events = [];
    const h = hostOver(events, { trapFirst: true, aborts: 'parser delete' });
    await assert.rejects(h.parseFile('a.rb', 'x'), (error) => error.code === 'ERUNTIMEABORTED' && /while parsing a\.rb/.test(error.message) && error.cause instanceof WebAssembly.RuntimeError);
    assert.deepEqual(events.filter((e) => e.startsWith('parse ')), ['parse x', 'parse x']);
    assert.deepEqual(after(events, 'ABORT'), []);
    await refusesLaterCalls(h, events, 'while parsing a.rb');
  });

  it('a reset that aborts after a stopped parse rejects with ERUNTIMEABORTED, not EPARSESTOPPED, and later calls are refused without reaching the runtime', async () => {
    const events = [];
    const h = hostOver(events, { aborts: 'reset' });
    await assert.rejects(h.parseFile('a.cs', 'x', undefined, STOP), (error) => error.code === 'ERUNTIMEABORTED' && /while parsing a\.cs/.test(error.message));
    assert.deepEqual(after(events, 'ABORT'), []);
    await refusesLaterCalls(h, events, 'while parsing a.cs');
  });

  it('a reset that aborts on the retry parser after a scanner trap leaves that parser unfreed', async () => {
    const events = [];
    const h = hostOver(events, { trapFirst: true, aborts: 'reset' });
    await assert.rejects(h.withParsedFile('a.rb', 'x', () => 'unreached', undefined, STOP), (error) => error.code === 'ERUNTIMEABORTED' && /while parsing a\.rb/.test(error.message));
    assert.deepEqual(after(events, 'ABORT'), []);
    await refusesLaterCalls(h, events, 'while parsing a.rb');
  });

  it('a delete that throws an error that is no abort is passed through as it is, and the host stays usable', async () => {
    const events = [];
    const h = hostOver(events, { fails: 'tree delete' });
    await assert.rejects(h.withParsedFile('a.cs', 'x', (tree) => tree.rootNode.type), (error) => error.message === 'tree delete failed' && error.code === undefined);
    assert.equal(await h.parseFile('b.cs', 'y').then((tree) => tree.rootNode.type), 'program', 'the next call reaches the runtime');
    assert.deepEqual(events, ['new Parser', 'set language', 'parse x', 'tree delete x', 'parse y']);
  });

  it('without an abort the host still frees the retry parser and the tree withParsedFile parsed', async () => {
    const events = [];
    const h = hostOver(events, { trapFirst: true });
    assert.equal(await h.withParsedFile('a.rb', 'x', (tree) => tree.rootNode.type), 'program');
    assert.deepEqual(events, ['new Parser', 'set language', 'parse x', 'new Parser', 'set language', 'parse x', 'parser delete', 'tree delete x']);
  });

  it('a parse that aborts after another call parsed, but before that call\'s function ran: withParsedFile does not call it, rejects with ERUNTIMEABORTED and leaves the tree unfreed', async () => {
    const events = [];
    const h = hostOver(events);
    await h.getParser('.cs');
    let fnRan = false;
    const [parsed, aborting] = await Promise.allSettled([
      h.withParsedFile('b.cs', 'one', (tree) => { fnRan = true; return tree.rootNode.type; }),
      h.parseFile('a.cs', 'abort'),
    ]);
    assert.deepEqual(events.filter((e) => e.startsWith('parse ') || e === 'ABORT'), ['parse one', 'parse abort', 'ABORT'], 'b.cs parsed before a.cs aborted');
    assert.equal(aborting.reason.code, 'ERUNTIMEABORTED');
    assert.equal(fnRan, false);
    assert.equal(parsed.reason.code, 'ERUNTIMEABORTED');
    assert.match(parsed.reason.message, /earlier, while parsing a\.cs, so b\.cs was parsed, but its function was not called/);
    assert.deepEqual(after(events, 'ABORT'), []);
  });
});

describe('making a parser, and the function of withParsedFile, around a runtime abort', () => {
  // The stub runtime of the tests above, aborting where a parser is made or its language set, or in the function withParsedFile calls, which walks the tree through the runtime's allocator and may parse again.
  const refusesLaterCalls = async (h, events, first) => {
    const mark = events.length;
    await assert.rejects(h.parseFile('later.cs', 'y'), (error) => error.code === 'ERUNTIMEABORTED' && error.message.includes(`earlier, while ${first}, so later.cs was not parsed`));
    await assert.rejects(h.getParser('.rb'), (error) => error.code === 'ERUNTIMEABORTED');
    assert.throws(() => h.newParser(), (error) => error.code === 'ERUNTIMEABORTED');
    assert.deepEqual(events.slice(mark), [], 'a later call does not reach the runtime');
  };
  const recorded = (what) => (error) => error.code === 'ERUNTIMEABORTED' && error.message.includes(`aborted while ${what} (Aborted()`) && error.cause instanceof WebAssembly.RuntimeError;

  it('an init that fails with an Aborted( error, as a runtime WebAssembly file that cannot be fetched or instantiated does, is not taken for an abort: a later call retries it', async () => {
    let inits = 0;
    class FailingInitParser {
      static init() { return ++inits === 1 ? Promise.reject(new WebAssembly.RuntimeError('Aborted(both async and sync fetching of the wasm failed). Build with -sASSERTIONS for more info.')) : Promise.resolve(); }
      setLanguage() {}
      parse() { return { rootNode: { type: 'program' }, delete() {} }; }
      delete() {}
    }
    const h = createParserHost({ runtime: { Parser: FailingInitParser, Language: { load: async () => ({}) } }, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
    await assert.rejects(h.parseFile('a.cs', 'x'), (error) => error.code === undefined && error.message.startsWith('Aborted(both async'));
    assert.equal((await h.parseFile('b.cs', 'y')).rootNode.type, 'program', 'the init was retried');
    assert.equal(inits, 2);
    await assert.rejects(createParserHost({ runtime: { Parser: class extends FailingInitParser { static init() { return Promise.reject(new WebAssembly.RuntimeError('Aborted(no wasm)')); } }, Language: { load: async () => ({}) } }, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] }).getParser('.cs'), (error) => error.code === undefined && error.message === 'Aborted(no wasm)');
  });

  it('newParser that aborts throws ERUNTIMEABORTED and is recorded, so a later file is not named for it', async () => {
    const events = [];
    const h = hostOver(events, { aborts: 'new Parser', nth: 2 });
    await h.getParser('.cs');
    assert.throws(() => h.newParser(), recorded('making a new parser'));
    await refusesLaterCalls(h, events, 'making a new parser');
  });

  it('getParser that aborts making the first parser of a grammar rejects with ERUNTIMEABORTED and is recorded', async () => {
    const events = [];
    const h = hostOver(events, { aborts: 'new Parser' });
    await assert.rejects(h.getParser('.cs'), recorded('getting the parser for .cs'));
    await refusesLaterCalls(h, events, 'getting the parser for .cs');
  });

  it('a parse whose first parser aborts as it is made rejects with ERUNTIMEABORTED and is recorded', async () => {
    const events = [];
    const h = hostOver(events, { aborts: 'new Parser' });
    await assert.rejects(h.parseFile('a.cs', 'x'), recorded('parsing a.cs'));
    await refusesLaterCalls(h, events, 'parsing a.cs');
  });

  it('a parse whose parser aborts as its language is set rejects with ERUNTIMEABORTED and is recorded', async () => {
    const events = [];
    const h = hostOver(events, { aborts: 'set language' });
    await assert.rejects(h.withParsedFile('a.cs', 'x', () => 'unreached'), recorded('parsing a.cs'));
    await refusesLaterCalls(h, events, 'parsing a.cs');
  });

  it('a retry after a scanner trap whose fresh parser aborts as it is made rejects with ERUNTIMEABORTED and is recorded', async () => {
    const events = [];
    const h = hostOver(events, { trapFirst: true, aborts: 'new Parser', nth: 2 });
    await assert.rejects(h.parseFile('a.rb', 'x'), recorded('parsing a.rb'));
    assert.deepEqual(events.filter((e) => e.startsWith('parse ')), ['parse x'], 'the trap was met, and the retry aborted before it parsed');
    await refusesLaterCalls(h, events, 'parsing a.rb');
  });

  it('an abort the function of withParsedFile throws rejects with ERUNTIMEABORTED, is recorded, and the tree is not freed', async () => {
    const events = [];
    const h = hostOver(events);
    await assert.rejects(h.withParsedFile('a.cs', 'x', () => {
      events.push('ABORT');
      throw abortError();
    }), recorded('working on the tree of a.cs'));
    assert.deepEqual(after(events, 'ABORT'), [], 'the tree of a.cs was not freed');
    await refusesLaterCalls(h, events, 'working on the tree of a.cs');
  });

  it('an error the function throws that is no abort still reaches the caller as it is, and the tree is freed', async () => {
    const events = [];
    const h = hostOver(events);
    await assert.rejects(h.withParsedFile('a.cs', 'x', () => { throw new Error('the consumer failed'); }), (error) => error.message === 'the consumer failed' && error.code === undefined);
    assert.equal(events.at(-1), 'tree delete x');
    assert.equal(await h.withParsedFile('b.cs', 'y', (tree) => tree.rootNode.type), 'program');
  });
});

describe('what the host leaves after a runtime abort, and the runtime freeing on collection', () => {
  // web-tree-sitter 0.27.2 frees a parser or a tree it made once JavaScript collects it, unless it was deleted first; after an abort that free runs on the damaged runtime, outside every handler, where it can fail and end the process. So what the host leaves unfreed after an abort must stay referenced. The stub runtime of the tests above, with `collects`, logs each such free; each case below drops every reference it holds, the host's too, and forces collections until an object nobody holds was freed.
  v8.setFlagsFromString('--expose-gc');
  const gc = vm.runInNewContext('gc');
  const collect = async (runtime, events) => {
    runtime.witness();
    for (let i = 0; i < 100 && !events.includes('finalize witness'); i++) {
      gc();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    for (let i = 0; i < 3; i++) {
      gc();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.ok(events.includes('finalize witness'), 'a collection ran');
  };
  const hostOn = (runtime) => createParserHost({ runtime, runtimeIdentity: 'r', grammarDirs: [GRAMMAR_DIR] });
  const cases = [
    ['the tree withParsedFile held across another call\'s abort, the parser it cached and the parser a scanner trap dropped', { trapFirst: true }, async (h) => {
      (await h.parseFile('t.rb', 'x')).delete();
      await h.getParser('.cs');
      let release;
      let started;
      const gate = new Promise((resolve) => { release = resolve; });
      const running = new Promise((resolve) => { started = resolve; });
      const holding = h.withParsedFile('b.cs', 'one', async (tree) => { started(); await gate; return tree.rootNode.type; });
      await running;
      await assert.rejects(h.parseFile('a.cs', 'abort'), (error) => error.code === 'ERUNTIMEABORTED');
      release();
      assert.equal(await holding, 'program');
    }],
    ['the parser a scanner trap dropped and the retry parser that aborted', { trapFirst: true }, async (h) => {
      await assert.rejects(h.parseFile('a.rb', 'abort'), (error) => error.code === 'ERUNTIMEABORTED');
    }],
    ['a parser whose language could not be set', { aborts: 'set language' }, async (h) => {
      await assert.rejects(h.parseFile('a.cs', 'x'), (error) => error.code === 'ERUNTIMEABORTED');
    }],
    ['the tree of a function that aborted, and the cached parser', {}, async (h, events) => {
      await assert.rejects(h.withParsedFile('a.cs', 'x', () => { events.push('ABORT'); throw abortError(); }), (error) => error.code === 'ERUNTIMEABORTED');
    }],
  ];
  for (const [what, script, scenario] of cases) {
    it(`stays referenced once the host is gone, so the runtime frees none of it: ${what}`, async () => {
      const events = [];
      const runtime = freeingRuntime(events, { ...script, collects: true });
      await (async () => { await scenario(hostOn(runtime), events); })();
      assert.ok(events.includes('ABORT'), 'the runtime aborted');
      await collect(runtime, events);
      assert.deepEqual(after(events, 'ABORT'), ['finalize witness'], 'nothing the host left was freed by the runtime after the abort');
    });
  }

  it('stays referenced as long as the runtime, also when the host was given a subclass of the runtime\'s Parser of its own', async () => {
    const events = [];
    const runtime = freeingRuntime(events, { collects: true });
    await (async () => {
      const h = hostOn({ Parser: class extends runtime.Parser {}, Language: runtime.Language });
      await h.getParser('.cs');
      await assert.rejects(h.parseFile('a.cs', 'abort'), (error) => error.code === 'ERUNTIMEABORTED');
    })();
    await collect(runtime, events);
    assert.deepEqual(after(events, 'ABORT'), ['finalize witness']);
  });

  it('is kept no longer than its runtime: once the host and the runtime are let go, the runtime is collected with what the host kept', async () => {
    // A consumer that replaces a runtime that aborted with a fresh copy, in the same process, lets the old copy go with its memory, some 2 GiB after an abort at the limit.
    const events = [];
    let runtimeRef;
    await (async () => {
      const runtime = freeingRuntime(events, { trapFirst: true, collects: true });
      runtimeRef = new WeakRef(runtime.Parser);
      const h = hostOn(runtime);
      await h.getParser('.cs');
      await assert.rejects(h.parseFile('a.rb', 'abort'), (error) => error.code === 'ERUNTIMEABORTED');
    })();
    for (let i = 0; i < 100 && runtimeRef.deref() !== undefined; i++) {
      gc();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.equal(runtimeRef.deref(), undefined, 'the runtime was collected');
  });
});
