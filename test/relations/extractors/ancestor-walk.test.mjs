// The extractors read the context of a node (the enclosing namespaces, types, type parameters, conditional groups) from the walk that reaches it, never by climbing `.parent` from each node: on a deeply nested file a climb per node costs the square of the depth. The work is counted through the tree-sitter node's `parent` accessor, wrapped for the duration of each run, so the count is deterministic (it does not depend on the machine's speed).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as TreeSitter from 'web-tree-sitter';
import { runExtractor } from '../../helpers/tree-sitter.mjs';
import { csharpExtractor, javaExtractor, kotlinExtractor, rustExtractor, cExtractor, cppExtractor, pythonExtractor, phpExtractor, rubyExtractor } from '../../helpers/internal/relations.mjs';

/** Runs `fn` with the node's `parent` accessor counting its calls, and returns the count. */
async function countAncestorSteps(fn) {
  const proto = TreeSitter.Node.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, 'parent');
  let steps = 0;
  Object.defineProperty(proto, 'parent', {
    ...original,
    get() {
      steps++;
      return original.get.call(this);
    },
  });
  try {
    await fn();
  } finally {
    Object.defineProperty(proto, 'parent', original);
  }
  return steps;
}

// Every accessor an extractor reaches the tree through: the climb (`parent`), the descent and the siblings. Rust, C and C++ read no ancestor at all, so their `parent` count is zero at every depth and says nothing; the number of calls through all of these grows with the nodes visited, hence with depth, and a hidden climb or a rescan per node makes it grow faster than that.
const TREE_GETTERS = ['parent', 'children', 'namedChildren', 'firstChild', 'lastChild', 'firstNamedChild', 'lastNamedChild', 'nextSibling', 'previousSibling', 'nextNamedSibling', 'previousNamedSibling'];
const TREE_METHODS = ['child', 'namedChild', 'childForFieldName', 'childWithDescendant', 'descendantsOfType', 'descendantForIndex', 'namedDescendantForIndex', 'descendantForPosition', 'namedDescendantForPosition', 'walk'];

// The tree cursor's moves: every extractor walks with a cursor, so a rescan of the tree per node shows here and nowhere in the node accessors.
const CURSOR_MEMBERS = ['currentNode', 'gotoFirstChild', 'gotoLastChild', 'gotoParent', 'gotoNextSibling', 'gotoPreviousSibling', 'gotoDescendant', 'gotoFirstChildForIndex', 'gotoFirstChildForPosition', 'reset', 'resetTo'];

/** Runs `fn` with every tree accessor and every cursor move counting its calls, and returns the count. */
async function countTreeAccesses(fn) {
  const originals = [];
  let calls = 0;
  for (const [proto, keys] of [[TreeSitter.Node.prototype, [...TREE_GETTERS, ...TREE_METHODS]], [TreeSitter.TreeCursor.prototype, CURSOR_MEMBERS]]) {
    for (const key of keys) {
      const original = Object.getOwnPropertyDescriptor(proto, key);
      if (original === undefined) continue;
      originals.push([proto, key, original]);
      if (original.get !== undefined) {
        Object.defineProperty(proto, key, {
          ...original,
          get() {
            calls++;
            return original.get.call(this);
          },
        });
      } else {
        Object.defineProperty(proto, key, {
          ...original,
          value(...args) {
            calls++;
            return original.value.apply(this, args);
          },
        });
      }
    }
  }
  try {
    await fn();
  } finally {
    for (const [proto, key, original] of originals) Object.defineProperty(proto, key, original);
  }
  return calls;
}

/** Visits `root` and every node below it with a tree cursor. */
function visitAll(root, visit) {
  const cursor = root.walk();
  try {
    let depth = 0;
    for (;;) {
      visit(cursor.currentNode);
      if (cursor.gotoFirstChild()) {
        depth++;
        continue;
      }
      while (depth > 0 && !cursor.gotoNextSibling()) {
        cursor.gotoParent();
        depth--;
      }
      if (depth === 0) return;
    }
  } finally {
    cursor.delete();
  }
}

/** Whether a count at the large depth is a linear growth of the count at the small one (doubling the depth gives 2.0; a rescan per node gives about 4.0). */
const growsLinearly = (small, large) => large <= 2.5 * small + 20;

/** A deliberately quadratic walk: the whole tree is rescanned with a cursor at every node. */
const quadraticExtractor = {
  declarations: (file) => visitAll(file.tree.rootNode, () => visitAll(file.tree.rootNode, () => {})),
  uses: () => [],
};

const range = (n) => Array.from({ length: n }, (_, i) => i);

// One synthetic file per language, nested `depth` levels, with a reference to a name and a declaration at every level, so that every context an extractor reads from the ancestors is asked for at every depth.
const SOURCES = {
  csharp: {
    extractor: csharpExtractor, language: 'csharp', ext: '.cs',
    source: (n) =>
      range(n).map((i) => `namespace N${i} {\n using A${i} = Lib.T${i};\n using static Lib.S${i};\n [Mark${i}] class C${i}<T${i}> {\n Foo${i} f${i}; T${i} g${i};\n void M${i}<U${i}>(Bar${i} b) { var x = Guard${i}.Run(); b.Ext${i}(); (Quux${i} p, int q) = Pair(); string s = nameof(Hid${i}); Make<(Tup${i} Item, int Index)>(1); }\n`).join('') +
      range(n).map(() => '} }\n').join(''),
  },
  java: {
    extractor: javaExtractor, language: 'java', ext: '.java',
    source: (n) =>
      'package p;\n' + range(n).map((i) => `class C${i}<T${i}> extends Base${i} {\n Foo${i} f${i}; T${i} g${i};\n void m${i}() { Util${i}.run(); }\n`).join('') + range(n).map(() => '}\n').join(''),
  },
  kotlin: {
    extractor: kotlinExtractor, language: 'kotlin', ext: '.kt',
    source: (n) =>
      'package p\n' + range(n).map((i) => `class C${i}<T${i}> : Base${i}() {\n val f${i}: Foo${i} = Foo${i}.make()\n val g${i}: T${i}? = null\n`).join('') + range(n).map(() => '}\n').join(''),
  },
  rust: {
    extractor: rustExtractor, language: 'rust', ext: '.rs',
    source: (n) =>
      range(n).map((i) => `mod m${i} {\n use super::a${i}::X;\n use self::b${i}::Y;\n mod file${i};\n`).join('') + range(n).map(() => '}\n').join(''),
  },
  c: {
    extractor: cExtractor, language: 'c', ext: '.c',
    source: (n) => range(n).map((i) => `#if ${i + 1}\n#include "h${i}.h"\n`).join('') + range(n).map(() => '#endif\n').join(''),
  },
  cpp: {
    extractor: cppExtractor, language: 'cpp', ext: '.cpp',
    source: (n) => range(n).map((i) => `#ifdef M${i}\n#include "h${i}.hpp"\n`).join('') + range(n).map(() => '#endif\n').join(''),
  },
  python: {
    extractor: pythonExtractor, language: 'python', ext: '.py',
    source: (n) => range(n).map((i) => `${' '.repeat(i)}def f${i}():\n${' '.repeat(i + 1)}import m${i}\n`).join('') + `${' '.repeat(n)}pass\n`,
  },
  php: {
    extractor: phpExtractor, language: 'php', ext: '.php',
    source: (n) => '<?php\n' + range(n).map((i) => `if ($a${i}) { $x${i} = new \\App\\Deep${i}(); \\App\\Util${i}::run();\n`).join('') + range(n).map(() => '}\n').join(''),
  },
  ruby: {
    extractor: rubyExtractor, language: 'ruby', ext: '.rb',
    source: (n) => range(n).map((i) => `module M${i}\n include Mixin${i}\n X${i} = Other${i}::Thing\n`).join('') + range(n).map(() => 'end\n').join(''),
  },
};

const SMALL = 40;
const LARGE = 80;

describe('extractors carry the context down the walk (ancestor steps grow linearly with depth)', () => {
  for (const [name, { extractor, language, ext, source }] of Object.entries(SOURCES)) {
    it(`${name}: doubling the depth about doubles the ancestor steps`, async () => {
      const small = await countAncestorSteps(() => runExtractor(extractor, language, ext, source(SMALL)));
      const large = await countAncestorSteps(() => runExtractor(extractor, language, ext, source(LARGE)));
      // Linear growth doubles the count (2.0); a climb per node quadruples it (about 4.0).
      assert.ok(large <= 2.5 * small + 20, `${name}: ${small} ancestor steps at depth ${SMALL}, ${large} at depth ${LARGE}`);
    });

    it(`${name}: the tree accesses grow with the depth and no faster than linearly`, async () => {
      const small = await countTreeAccesses(() => runExtractor(extractor, language, ext, source(SMALL)));
      const large = await countTreeAccesses(() => runExtractor(extractor, language, ext, source(LARGE)));
      // The count is not empty and it does grow with depth, so the bound below measures something for this language.
      assert.ok(small > 0, `${name}: no tree access counted at depth ${SMALL}`);
      assert.ok(large >= 1.5 * small, `${name}: ${small} tree accesses at depth ${SMALL}, ${large} at depth ${LARGE}: the count does not grow with depth`);
      // Linear growth doubles the count (2.0); work per node that itself grows with depth quadruples it (about 4.0).
      assert.ok(growsLinearly(small, large), `${name}: ${small} tree accesses at depth ${SMALL}, ${large} at depth ${LARGE}`);
    });
  }

  it('the bound rejects a walk that rescans the tree with a cursor at every node', async () => {
    const { language, ext, source } = SOURCES.rust;
    const small = await countTreeAccesses(() => runExtractor(quadraticExtractor, language, ext, source(SMALL)));
    const large = await countTreeAccesses(() => runExtractor(quadraticExtractor, language, ext, source(LARGE)));
    assert.ok(small > 0 && large > 0);
    assert.equal(growsLinearly(small, large), false, `the quadratic walk counted ${small} at depth ${SMALL} and ${large} at depth ${LARGE}, and the bound let it through`);
  });
});
