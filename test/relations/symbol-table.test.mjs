// Moved from Yggdrasil source/cli/tests/unit/relations/symbol-table.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../helpers/expect.mjs';
import { SymbolTable } from '@chrisdudek/runes/relations';

describe('SymbolTable', () => {
  it('resolves a uniquely-defined symbol to its file (same language)', () => {
    const t = new SymbolTable(); t.declare('csharp', 'Foo.Bar', 'src/a.cs');
    expect(t.resolveUnique('csharp', 'Foo.Bar')).toBe('src/a.cs');
  });
  it('returns undefined for an ambiguous symbol within one language (two defs)', () => {
    const t = new SymbolTable();
    t.declare('csharp', 'Foo.Bar', 'src/a.cs'); t.declare('csharp', 'Foo.Bar', 'vendor/b.cs');
    expect(t.resolveUnique('csharp', 'Foo.Bar')).toBeUndefined();
  });
  it('returns undefined for an unknown symbol', () => {
    expect(new SymbolTable().resolveUnique('csharp', 'Nope')).toBeUndefined();
  });
  it('PARTITION: a use in one language does NOT match a same-name decl in another language', () => {
    // The cross-language bare-name FP: C++ `class Connection` must not satisfy a Ruby `Connection`.
    const t = new SymbolTable();
    t.declare('cpp', 'Connection', 'src/net/connection.cpp');
    expect(t.resolveUnique('ruby', 'Connection')).toBeUndefined(); // partitioned → silence
    expect(t.resolveUnique('cpp', 'Connection')).toBe('src/net/connection.cpp'); // same language still resolves
  });
  it('PARTITION: the SAME symbolKey may resolve independently per language', () => {
    const t = new SymbolTable();
    t.declare('ruby', 'Connection', 'src/a/connection.rb');
    t.declare('cpp', 'Connection', 'src/net/connection.cpp');
    expect(t.resolveUnique('ruby', 'Connection')).toBe('src/a/connection.rb');
    expect(t.resolveUnique('cpp', 'Connection')).toBe('src/net/connection.cpp');
  });
});

describe('SymbolTable — JVM namespace and package members', () => {
  it('java and kotlin share one namespace; other languages do not', () => {
    const st = new SymbolTable();
    st.declare('java', 'a.B', 'B.java');
    expect(st.filesFor('kotlin', 'a.B')).toEqual(['B.java']);
    expect(st.filesFor('csharp', 'a.B')).toEqual([]);
  });
  it('filesInPackage lists direct top-level members only (no nested `+` keys, no sub-packages)', () => {
    const st = new SymbolTable();
    st.declare('kotlin', 'a.A', 'A.kt');
    st.declare('kotlin', 'a.A+Inner', 'N.kt');
    st.declare('kotlin', 'a.b.C', 'C.kt');
    st.declare('kotlin', 'Root', 'R.kt');
    expect(st.filesInPackage('java', 'a')).toEqual(['A.kt']);
    expect(st.filesInPackage('kotlin', 'a.b')).toEqual(['C.kt']);
    expect(st.filesInPackage('kotlin', '')).toEqual(['R.kt']);
    expect(st.filesInPackage('kotlin', 'zz')).toEqual([]);
  });
});

describe('SymbolTable.hasNamespace', () => {
  it('knows every dotted namespace a declared key lies in, and nothing else', () => {
    const st = new SymbolTable();
    st.declare('csharp', 'A.B.Order', 'Order.cs');
    st.declare('csharp', 'C.Outer+Inner', 'Outer.cs');
    st.declare('csharp', 'D.Ext.Run()', 'Ext.cs');
    st.declare('csharp', 'Global', 'Global.cs');
    expect(st.hasNamespace('csharp', 'A')).toBe(true);
    expect(st.hasNamespace('csharp', 'A.B')).toBe(true);
    expect(st.hasNamespace('csharp', 'A.B.Order')).toBe(false); // a type, not a namespace
    expect(st.hasNamespace('csharp', 'C')).toBe(true);
    expect(st.hasNamespace('csharp', 'C.Outer')).toBe(false); // a type nesting another
    expect(st.hasNamespace('csharp', 'D.Ext')).toBe(true); // the namespace of an extension key
    expect(st.hasNamespace('csharp', 'Global')).toBe(false);
    expect(st.hasNamespace('java', 'A')).toBe(false); // per language
  });
});
