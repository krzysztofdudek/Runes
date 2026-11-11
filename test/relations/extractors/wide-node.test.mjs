// A node with very many direct children: the flat run of ERROR nodes a malformed file parses into, one string literal of millions of escapes, a file of thousands of top-level statements. Tree-sitter keeps neither a child index nor a parent pointer, so `node.child(i)` and `node.namedChild(i)` step from the first child on every call and `node.parent` searches down from the root past the earlier children of every ancestor; an extractor that asks either for each child costs the square of the number of children. Each input is read at a quarter of its size and at its full size, and the full read may take at most eight times as long as the quarter read: linear time gives about four, the square gives sixteen. A ratio, not a number of seconds, because coverage instrumentation and a loaded machine slow every read alike but leave the ratio where it was; the same inputs took between twenty seconds and two minutes while the extractors asked, and the quarter read took a fraction of that.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withParsedFile, parsedFile } from '../../helpers/tree-sitter.mjs';
import * as relations from '../../helpers/internal/relations.mjs';

const SIZE = 388_000;
const QUARTER = 0.25;
const MAX_RATIO = 8;
// The quarter read of the smallest input is some tens of milliseconds, where a timer's jitter is a large share of it.
const FLOOR_MS = 50;
const READS = 2;
const repeatTo = (unit, size) => unit.repeat(Math.floor(size / unit.length));
// Unterminated strings, one per line: every grammar reads them as one long flat run of ERROR nodes.
const malformed = (scale) => repeatTo('"a(\n', SIZE * scale);

const timed = async (extractor, filePath, language, code) => {
  let out;
  await withParsedFile(filePath, code, (tree) => {
    const file = parsedFile(filePath, code, tree, language);
    const start = performance.now();
    const uses = extractor.uses(file);
    const declarations = extractor.declarations(file);
    out = { uses, declarations, elapsed: performance.now() - start };
  });
  return out;
};

// The fastest of a few reads: the noise on a read only ever adds to it.
const best = async (extractor, filePath, language, code) => {
  let result;
  for (let i = 0; i < READS; i++) {
    const read = await timed(extractor, filePath, language, code);
    if (!result || read.elapsed < result.elapsed) result = read;
  }
  return result;
};

// `make(scale)` builds the input at `scale` times its full size; the result is that of the full read.
const readsLinearly = async (extractor, filePath, language, make) => {
  const quarter = await best(extractor, filePath, language, make(QUARTER));
  const full = await best(extractor, filePath, language, make(1));
  const allowed = MAX_RATIO * Math.max(quarter.elapsed, FLOOR_MS);
  assert.ok(full.elapsed < allowed, `a quarter of the input took ${Math.round(quarter.elapsed)} ms, the whole of it ${Math.round(full.elapsed)} ms: over ${MAX_RATIO} times`);
  return full;
};

describe('a node with very many children is read in time linear in their number', () => {
  it('malformed JavaScript of 388 000 characters', async () => {
    const { uses, declarations } = await readsLinearly(relations.typescriptExtractor, 'm.js', 'javascript', malformed);
    assert.deepEqual([uses.length, declarations.length], [0, 0]);
  });

  it('a Go file whose one string literal holds 6 million characters of escapes', async () => {
    const make = (scale) => `package a\n\nimport "fmt"\n\nvar _x = "${repeatTo('\\x1f', 6_000_000 * scale)}"\n\nfunc main() { fmt.Println(_x) }\n`;
    const { uses, declarations } = await readsLinearly(relations.goExtractor, 'b.go', 'go', make);
    assert.deepEqual(uses.map((u) => u.candidates[0].specifier), ['fmt']);
    assert.deepEqual(declarations, [{ symbolKey: 'main', line: 7 }]);
  });

  // Kotlin's one declaration is its mark for a file whose declarations cannot all be read.
  for (const [name, extractor, filePath, language, make, declared = []] of [
    ['Java', relations.javaExtractor, 'A.java', 'java', malformed],
    ['Kotlin', relations.kotlinExtractor, 'A.kt', 'kotlin', malformed, [{ symbolKey: '*', line: 1 }]],
    ['PHP', relations.phpExtractor, 'a.php', 'php', (scale) => `<?php\n${malformed(scale)}`],
    ['Rust', relations.rustExtractor, 'a.rs', 'rust', malformed],
    ['Ruby', relations.rubyExtractor, 'a.rb', 'ruby', malformed],
    ['Python', relations.pythonExtractor, 'a.py', 'python', malformed],
    ['C', relations.cExtractor, 'a.c', 'c', malformed],
    ['C++', relations.cppExtractor, 'a.cpp', 'cpp', malformed],
    ['C#', relations.csharpExtractor, 'A.cs', 'csharp', malformed],
  ]) {
    it(`malformed ${name} of 388 000 characters`, async () => {
      const { uses, declarations } = await readsLinearly(extractor, filePath, language, make);
      assert.deepEqual(uses, []);
      assert.deepEqual(declarations, declared);
    });
  }

  // Dotted names in the run: each is a qualified name no type position takes, which is read against its parent, and each gives its reference.
  it('malformed C# of 388 000 characters whose lines hold dotted names', async () => {
    const line = 'A.B c(\n';
    const { uses, declarations } = await readsLinearly(relations.csharpExtractor, 'A.cs', 'csharp', (scale) => repeatTo(line, SIZE * scale));
    assert.equal(uses.length, Math.floor(SIZE / line.length));
    assert.equal(declarations.length, 0);
  });

  // Kotlin recovery reads a damaged file one top-level declaration at a time. A file of many damaged declarations re-reads each of them; a file whose first declaration never closes its bracket is one declaration as long as the file, on which the grammar's own error recovery re-reads its input a number of times that grows with the square of its length.
  describe('malformed Kotlin of 160 000 characters, each line damaged', () => {
    const KOTLIN_SIZE = 160_000;
    const kotlinLines = (line) => (scale) => {
      let code = '';
      for (let i = 0; code.length < KOTLIN_SIZE * scale; i++) code += line(i);
      return code;
    };
    const marked = (key) => [{ symbolKey: key, line: 1 }, { symbolKey: '*', line: 1 }, { symbolKey: 'AKt', line: 1 }];

    it('a function whose body is a stray parenthesis on every line declares each function', async () => {
      const make = kotlinLines((i) => `fun f${i}() = )\n`);
      const { uses, declarations } = await readsLinearly(relations.kotlinExtractor, 'A.kt', 'kotlin', make);
      const lines = make(1).split('\n').length - 1;
      assert.deepEqual(uses, []);
      assert.deepEqual(declarations, [...Array.from({ length: lines }, (_, i) => ({ symbolKey: `f${i}`, line: i + 1 })), { symbolKey: 'AKt', line: 1 }]);
    });

    it('an annotated function whose parameter list never closes', async () => {
      const { uses, declarations } = await readsLinearly(relations.kotlinExtractor, 'A.kt', 'kotlin', kotlinLines(() => '@A.B fun f(\n'));
      assert.deepEqual(uses, []);
      assert.deepEqual(declarations, marked('f'));
    });

    it('a property of a generic type whose initializer never closes', async () => {
      const { uses, declarations } = await readsLinearly(relations.kotlinExtractor, 'A.kt', 'kotlin', kotlinLines(() => 'val x: A.B<C> = (\n'));
      assert.deepEqual(uses, []);
      assert.deepEqual(declarations, marked('x'));
    });
  });

  it('a Python file of 20 000 decorated top-level functions declares each of them', async () => {
    const count = 20_000;
    const make = (scale) => {
      let code = '';
      for (let i = 0; i < count * scale; i++) code += `@traced\ndef handler_${i}():\n    pass\n`;
      return code;
    };
    const { uses, declarations } = await readsLinearly(relations.pythonExtractor, 'a.py', 'python', make);
    assert.equal(uses.length, 0);
    assert.equal(declarations.length, count);
    assert.deepEqual(declarations[count - 1], { symbolKey: `handler_${count - 1}`, line: 3 * count - 1 });
  });

  it('a Ruby file of 40 000 top-level constant references gives each its edge', async () => {
    const count = 40_000;
    const make = (scale) => {
      let code = '';
      for (let i = 0; i < count * scale; i++) code += `Billing::Invoice${i}.post\n`;
      return code;
    };
    const { uses } = await readsLinearly(relations.rubyExtractor, 'a.rb', 'ruby', make);
    assert.equal(uses.length, count);
  });
});
