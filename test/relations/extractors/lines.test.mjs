import { describe, it, expect } from '../../helpers/expect.mjs';
import { runExtractor, withParsedFile, host } from '../../helpers/tree-sitter.mjs';
import { extractorForLanguage } from '@chrisdudek/runes/relations';
import { lineReader, rowLine, kotlinView } from '../../helpers/internal/relations.mjs';

const at = (row, column) => ({ startPosition: { row, column } });

describe('lineReader', () => {
  it('reads the row plus one where no CR stands alone, whatever else the file holds', () => {
    for (const content of ['', 'a\nb', 'a\r\nb\r\n', '\uFEFFa\nb', 'a\u2028b\u2029c\u0085d\nf']) expect(lineReader(content)).toBe(rowLine);
    expect(rowLine(at(4, 7))).toBe(5);
  });

  it('counts LF, CRLF and a lone CR as one line end each, and U+2028, U+2029 and U+0085 as none', () => {
    const content = 'a\rb\r\nc\nd\u2028e\u2029f\u0085g\rh';
    const lineOf = lineReader(content);
    const lineAt = (index) => {
      const before = content.slice(0, index);
      const row = before.split('\n').length - 1;
      return lineOf(at(row, index - (before.lastIndexOf('\n') + 1)));
    };
    expect(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((c) => lineAt(content.indexOf(c)))).toEqual([1, 2, 3, 4, 4, 4, 4, 5]);
    expect(lineAt(content.indexOf('\r'))).toBe(1);
    expect(lineAt(content.indexOf('\r\n') + 1)).toBe(2);
  });

  it('reads a column in UTF-16 code units, as the runtime gives it and a JavaScript string counts', async () => {
    const content = "const s = '\u{1F600}\u{1F600}';\rimport x from './x';";
    await withParsedFile('a.ts', content, (tree) => {
      const statement = tree.rootNode.namedChildren.find((c) => c.type === 'import_statement');
      expect(statement.startPosition).toEqual({ row: 0, column: content.indexOf('import') });
      expect(statement.startIndex).toBe(content.indexOf('import'));
      expect(lineReader(content)(statement)).toBe(2);
    });
  });
});

// One file a language, LF-ended: each lists uses and declarations on several lines. The same file with every LF made a lone CR must give the same uses and declarations on the same lines. Go and Ruby read a lone CR as a space, so their statements end with a semicolon there.
const SAMPLES = {
  typescript: ['a.ts', ['const a = 1;', '', "import { b } from './b';", "export * from './c';", 'export class K {}', "const d = require('./d');"]],
  python: ['a.py', ['x = 1', '', 'import foo.bar', 'from . import baz', 'class K:', '    pass']],
  go: ['a.go', ['package a;', '', 'import "example.com/m/b";', '', 'func F() {};', 'type T struct{};']],
  java: ['A.java', ['package a;', '', 'import b.B;', 'import static c.C.f;', '', 'class A { D d; }']],
  kotlin: ['A.kt', ['package a', '', 'import b.B', '', '@Deprecated("x")', 'class A { val c: d.C? = null }', 'fun f() {}']],
  csharp: ['A.cs', ['namespace A;', '', 'using B;', 'using static C.D;', '', 'class K : E { F f; }', 'interface I {}', 'enum Z { One }']],
  php: ['a.php', ['<?php', 'namespace A;', '', 'use B\\C;', 'use function D\\e;', '', 'class K extends F {}', 'function g() {}']],
  rust: ['lib.rs', ['mod a;', 'extern crate serde as sd;', 'use crate::b::C;', 'pub use types::*;', '#[path = "x/y.rs"]', 'mod z;', 'mod inline { mod deep; }', 'cfg_if::cfg_if! { if #[cfg(unix)] { mod u; extern crate libc; } }', 'pub struct K;', 'fn f() { use crate::c::D; }']],
  ruby: ['a.rb', ['x = 1;', '', "require_relative 'b';", '', 'class K < B::C; end;', 'module M; X = Y::Z; end;']],
  c: ['a.c', ['int x;', '', '#include "b.h"', '#include <c.h>', '', 'int f(void) { return 0; }', 'struct S { int a; };']],
  cpp: ['a.cpp', ['int x;', '', '#include "b.h"', '', 'class K {};', 'namespace n { struct S {}; }']],
};

const read = async (language, file, code) => {
  const { uses, declarations } = await runExtractor(extractorForLanguage(language), language, file.slice(file.lastIndexOf('.')), code);
  return { uses: uses.map((u) => [JSON.stringify(u.candidates), u.line]), declarations: declarations.map((d) => [d.symbolKey, d.line]) };
};

describe('every extractor gives a file whose lines end with a lone CR the lines an editor shows', () => {
  for (const [language, [file, lines]] of Object.entries(SAMPLES)) {
    it(language, async () => {
      const lf = await read(language, file, `${lines.join('\n')}\n`);
      expect(Math.max(...lf.uses.map(([, line]) => line))).toBeGreaterThan(2);
      expect(Math.max(...lf.declarations.map(([, line]) => line))).toBeGreaterThan(2);
      expect(await read(language, file, `${lines.join('\r')}\r`)).toEqual(lf);
    });
  }
});

describe('kotlin recovery gives the lines an editor shows in a file that mixes lone CR and LF line ends', () => {
  const readKotlin = (code) => read('kotlin', 'a.kt', code);

  it('a declaration re-parsed on its own, and one read from its leading tokens, take their lines from their row and column', async () => {
    const code = 'package p\npublic %% class Thing\nclass Other {\r  val r: com.acme.data.Repo? = null\r}\n@Ann\rclass Box {\r  public %% fun hidden() {}\r}\n';
    await withParsedFile('a.kt', code, (tree) => {
      const view = kotlinView(tree, code, host.newParser);
      try {
        const reparsed = view.roots.find((r) => r.tree !== tree);
        expect(reparsed.text.startsWith('class Other')).toBe(true);
        expect(reparsed.startIndex).not.toBe(code.indexOf('class Other'));
        expect(view.lexical).toEqual([{ name: 'Box', kind: 'type', at: { row: 3, column: 5 } }]);
      } finally {
        view.dispose();
      }
    });
    const mixed = await readKotlin(code);
    expect(mixed).toEqual(await readKotlin(code.replace(/\r/g, '\n')));
    expect(mixed.uses).toEqual([['[{"kind":"symbol","symbolKey":"com.acme.data.Repo"}]', 4]]);
    expect(mixed.declarations).toEqual(expect.arrayContaining([['p.Other', 3], ['p.Other+r', 4], ['p.Box', 7]]));
  });

  it('a declaration the grammar misread as a statement takes the line of its keyword, after a lone CR on the same row', async () => {
    const code = 'package a\nval aLongNameThatPushesTheLineEndOut = 1\r@Keep annotation class X\n';
    const mixed = await readKotlin(code);
    expect(mixed).toEqual(await readKotlin(code.replace(/\r/g, '\n')));
    expect(mixed.declarations).toEqual(expect.arrayContaining([['a.aLongNameThatPushesTheLineEndOut', 2], ['a.X', 3]]));
  });

  it('a nested class joined to the constructor on its next line keeps the lines of the file, wherever the lone CR stands', async () => {
    const joined = 'package a\nclass Outer {\n  class Options\n  private constructor(val s: Other)\n}\n';
    const after = await readKotlin(`${joined}val z = 1\rval w = 2\n`);
    expect(after.uses).toEqual([['[{"kind":"symbol","symbolKey":"a.Other","samePackage":true}]', 4]]);
    expect(after).toEqual(await readKotlin(`${joined}val z = 1\nval w = 2\n`));
    const before = 'package a\n\nclass Outer {\r  val q: Other? = null\n  class Options\n  private constructor(val s: Other)\n}\n';
    const read = await readKotlin(before);
    expect(read.uses.map(([, line]) => line)).toEqual([4, 6]);
    expect(read).toEqual(await readKotlin(before.replace(/\r/g, '\n')));
  });

  it('a damaged file whose recovery joins a nested class to its constructor keeps the lines of the file', async () => {
    const code = 'package a\n\nclass Outer {\r  val q: x.Other? = null\n  class Options\n  private constructor(val s: x.O)\n}\npublic %% class Thing\nclass After {\r  val r: x.Other? = null\r}\n';
    const read = await readKotlin(code);
    expect(read).toEqual(await readKotlin(code.replace(/\r/g, '\n')));
    expect(read.uses.map(([, line]) => line)).toEqual([4, 6, 10]);
  });
});
