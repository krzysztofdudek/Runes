// A node with very many direct children: the flat run of ERROR nodes a malformed file parses into, one string literal of millions of escapes, a file of thousands of top-level statements. Tree-sitter keeps neither a child index nor a parent pointer, so `node.child(i)` and `node.namedChild(i)` step from the first child on every call and `node.parent` searches down from the root past the earlier children of every ancestor; an extractor that asks either for each child costs the square of the number of children. The bounds are generous: each input reads in about a second here, and the same inputs took between twenty seconds and two minutes while the extractors asked.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withParsedFile, parsedFile } from '../../helpers/tree-sitter.mjs';
import * as relations from '../../helpers/internal/relations.mjs';

const SIZE = 388_000;
const BOUND_MS = 10_000;
const repeatTo = (unit, size) => unit.repeat(Math.floor(size / unit.length));
// Unterminated strings, one per line: every grammar reads them as one long flat run of ERROR nodes.
const MALFORMED = repeatTo('"a(\n', SIZE);

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

describe('a node with very many children is read in time linear in their number', () => {
  it('malformed JavaScript of 388 000 characters', async () => {
    const { uses, declarations, elapsed } = await timed(relations.typescriptExtractor, 'm.js', 'javascript', MALFORMED);
    assert.deepEqual([uses.length, declarations.length], [0, 0]);
    assert.ok(elapsed < BOUND_MS, `took ${Math.round(elapsed)} ms`);
  });

  it('a Go file whose one string literal holds 6 million characters of escapes', async () => {
    const code = `package a\n\nimport "fmt"\n\nvar _x = "${repeatTo('\\x1f', 6_000_000)}"\n\nfunc main() { fmt.Println(_x) }\n`;
    const { uses, declarations, elapsed } = await timed(relations.goExtractor, 'b.go', 'go', code);
    assert.deepEqual(uses.map((u) => u.candidates[0].specifier), ['fmt']);
    assert.deepEqual(declarations, [{ symbolKey: 'main', line: 7 }]);
    assert.ok(elapsed < BOUND_MS, `took ${Math.round(elapsed)} ms`);
  });

  for (const [name, extractor, filePath, language, code] of [
    ['Java', relations.javaExtractor, 'A.java', 'java', MALFORMED],
    ['Kotlin', relations.kotlinExtractor, 'A.kt', 'kotlin', MALFORMED],
    ['PHP', relations.phpExtractor, 'a.php', 'php', `<?php\n${MALFORMED}`],
    ['Rust', relations.rustExtractor, 'a.rs', 'rust', MALFORMED],
    ['Ruby', relations.rubyExtractor, 'a.rb', 'ruby', MALFORMED],
    ['Python', relations.pythonExtractor, 'a.py', 'python', MALFORMED],
    ['C', relations.cExtractor, 'a.c', 'c', MALFORMED],
    ['C++', relations.cppExtractor, 'a.cpp', 'cpp', MALFORMED],
    ['C#', relations.csharpExtractor, 'A.cs', 'csharp', MALFORMED],
  ]) {
    it(`malformed ${name} of 388 000 characters`, async () => {
      const { uses, declarations, elapsed } = await timed(extractor, filePath, language, code);
      assert.deepEqual([uses.length, declarations.length], [0, 0]);
      assert.ok(elapsed < BOUND_MS, `took ${Math.round(elapsed)} ms`);
    });
  }

  it('a Python file of 20 000 decorated top-level functions declares each of them', async () => {
    const count = 20_000;
    let code = '';
    for (let i = 0; i < count; i++) code += `@traced\ndef handler_${i}():\n    pass\n`;
    const { uses, declarations, elapsed } = await timed(relations.pythonExtractor, 'a.py', 'python', code);
    assert.equal(uses.length, 0);
    assert.equal(declarations.length, count);
    assert.deepEqual(declarations[count - 1], { symbolKey: `handler_${count - 1}`, line: 3 * count - 1 });
    assert.ok(elapsed < BOUND_MS, `took ${Math.round(elapsed)} ms`);
  });

  it('a Ruby file of 40 000 top-level constant references gives each its edge', async () => {
    const count = 40_000;
    let code = '';
    for (let i = 0; i < count; i++) code += `Billing::Invoice${i}.post\n`;
    const { uses, elapsed } = await timed(relations.rubyExtractor, 'a.rb', 'ruby', code);
    assert.equal(uses.length, count);
    assert.ok(elapsed < BOUND_MS, `took ${Math.round(elapsed)} ms`);
  });
});
