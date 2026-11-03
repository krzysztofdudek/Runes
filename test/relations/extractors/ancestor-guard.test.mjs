// The extractors read the context of a node from the walk that reaches it (see ancestor-walk.test.mjs). This source guard keeps it that way: a climb up the ancestors in a loop is a cost per node again the moment it runs from a walk, and costs the square of the depth on a deeply nested file.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// The source guard: a climb up the ancestors (`x = x.parent`, `closest(`) in an extractor is a cost per node again the moment it runs from a walk.
const EXTRACTORS_DIR = fileURLToPath(new URL('../../../src/relations/extractors/', import.meta.url));

/** The lines of `text` that climb the ancestors in a loop, as `[line number, line]`. */
function ancestorClimbs(text) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    // `x = x.parent`, `x = x!.parent`, `x = x?.parent`; `f(node.parent)`, `f(node?.parent, …)` and `f(a, node!.parent)`, the recursive climb (a call handed the parent of a node); `closest(`.
    if (
      /\b(\w+)\s*=\s*\1\s*[!?]?\s*\.\s*parent\b/.test(code) ||
      /\b(?!(?:if|while|for|switch|is[A-Z_]|has[A-Z_])\w*\s*\()\w+\s*\([^()]*\b\w+\s*[!?]?\s*\.\s*parent\s*[!?]?\s*[,)]/.test(code) ||
      /\bclosest\s*\(/.test(code)
    ) {
      found.push([i + 1, line.trim()]);
    }
  });
  return found;
}

describe('no extractor climbs the ancestors in a loop', () => {
  it('src/relations/extractors holds no `x = x.parent` loop and no closest() call', () => {
    const files = readdirSync(EXTRACTORS_DIR).filter((f) => f.endsWith('.mts') && statSync(join(EXTRACTORS_DIR, f)).isFile());
    const climbs = files.flatMap((f) =>
      ancestorClimbs(readFileSync(join(EXTRACTORS_DIR, f), 'utf8')).map(([line, text]) => `${relative(EXTRACTORS_DIR, join(EXTRACTORS_DIR, f))}:${line}: ${text}`),
    );
    assert.deepEqual(climbs, []);
  });

  it('the scan finds the loop shapes the extractors used', () => {
    assert.equal(ancestorClimbs('for (let p = node.parent; p !== null; p = p.parent) {}').length, 1);
    assert.equal(ancestorClimbs('while (cur !== null) { cur = cur.parent; }').length, 1);
    assert.equal(ancestorClimbs('cur = cur.parent!;').length, 1);
    assert.equal(ancestorClimbs('const found = closest(node, "class");').length, 1);
    // The forms that slipped past: an optional-chaining climb and a recursive one.
    assert.equal(ancestorClimbs('cur = cur?.parent;').length, 1);
    assert.equal(ancestorClimbs('cur = cur?.parent ?? null;').length, 1);
    assert.equal(ancestorClimbs('return enclosing(node.parent);').length, 1);
    assert.equal(ancestorClimbs('return enclosing(node?.parent, depth + 1);').length, 1);
    assert.equal(ancestorClimbs('return enclosing(depth + 1, node!.parent);').length, 1);
    // A test of the parent, not a climb.
    assert.equal(ancestorClimbs('if (node.parent) return;').length, 0);
    assert.equal(ancestorClimbs('while (cur.parent) { n++; }').length, 0);
    assert.equal(ancestorClimbs('return isExported(node.parent);').length, 0);
    assert.equal(ancestorClimbs('const p = node.parent; // one step').length, 0);
    assert.equal(ancestorClimbs('if (node.parent?.type !== "x") return;').length, 0);
  });
});
