// The extractors read the context of a node (the enclosing namespaces, types, type parameters, conditional groups) from the walk that reaches it, never by climbing `.parent` from each node: on a deeply nested file a climb per node costs the square of the depth. The work is counted through the tree-sitter node's `parent` accessor, wrapped for the duration of each run, so the count is deterministic (it does not depend on the machine's speed).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as TreeSitter from 'web-tree-sitter';
import { runExtractor } from '../../helpers/tree-sitter.mjs';
import { javaExtractor, kotlinExtractor, rustExtractor, cExtractor, cppExtractor, pythonExtractor, phpExtractor, rubyExtractor } from '../../helpers/internal/relations.mjs';

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

const range = (n) => Array.from({ length: n }, (_, i) => i);

// One synthetic file per language, nested `depth` levels, with a reference to a name and a declaration at every level, so that every context an extractor reads from the ancestors is asked for at every depth.
const SOURCES = {
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
  }
});
