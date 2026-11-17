// Moved from Yggdrasil source/cli/tests/unit/relations/resolver.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../helpers/expect.mjs';
import { makeResolver, makeResolvePathToFile, listedFileView } from '@chrisdudek/runes/relations';
import { SymbolTable } from '@chrisdudek/runes/relations';

const owner = { ownerOf: (f) => (f === 'src/b.cs' ? 'b' : undefined) };

describe('resolver', () => {
  it('resolves a unique same-language symbol to a mapped owner', () => {
    const st = new SymbolTable(); st.declare('csharp', 'Foo.Bar', 'src/b.cs');
    const r = makeResolver({ ownerIndex: owner, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.resolve({ kind: 'symbol', symbolKey: 'Foo.Bar' }, 'src/a.cs', 'csharp')).toEqual({ owner: 'b', resolvedFile: 'src/b.cs' });
  });
  it('SILENCES a symbol whose only same-name decl is in ANOTHER language', () => {
    // owner.ownerOf maps src/b.cs → 'b'; but the decl is keyed under 'cpp', the use is 'ruby'.
    const st = new SymbolTable(); st.declare('cpp', 'Connection', 'src/b.cs');
    const r = makeResolver({ ownerIndex: owner, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.resolve({ kind: 'symbol', symbolKey: 'Connection' }, 'src/a.rb', 'ruby')).toBeUndefined();
  });
  it('returns undefined for an unmapped symbol target (D7 coverage layering)', () => {
    const st = new SymbolTable(); st.declare('csharp', 'X.Y', 'vendor/x.cs');
    const r = makeResolver({ ownerIndex: owner, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.resolve({ kind: 'symbol', symbolKey: 'X.Y' }, 'src/a.cs', 'csharp')).toBeUndefined();
  });
  it('returns undefined for an ambiguous symbol', () => {
    const st = new SymbolTable(); st.declare('csharp', 'A', 'src/b.cs'); st.declare('csharp', 'A', 'src/c.cs');
    const r = makeResolver({ ownerIndex: owner, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.resolve({ kind: 'symbol', symbolKey: 'A' }, 'src/a.cs', 'csharp')).toBeUndefined();
  });
  it('resolves a path hint via the injected resolver', () => {
    const r = makeResolver({ ownerIndex: owner, symbolTable: new SymbolTable(), resolvePathToFile: () => 'src/b.cs' });
    expect(r.resolve({ kind: 'path', specifier: './b' }, 'src/a.cs', 'csharp')).toEqual({ owner: 'b', resolvedFile: 'src/b.cs' });
  });
});

// The tri-state probe is the load-bearing addition: it lets the ordered walk distinguish a
// nearer AMBIGUOUS candidate (stop with silence) from an ABSENT one (continue). For a
// one-element group the outcome is byte-equivalent to `resolve` (resolved → edge; ambiguous
// or absent → no edge), but the classification itself MUST be three-valued.
describe('resolver.classify — tri-state (resolved / ambiguous / absent)', () => {
  it('symbol: a UNIQUE mapped definition is `resolved` with its owner + file', () => {
    const st = new SymbolTable(); st.declare('csharp', 'Foo.Bar', 'src/b.cs');
    const r = makeResolver({ ownerIndex: owner, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.classify({ kind: 'symbol', symbolKey: 'Foo.Bar' }, 'src/a.cs', 'csharp')).toEqual({
      kind: 'resolved', owner: 'b', resolvedFile: 'src/b.cs',
    });
  });
  it('symbol: 2+ definitions is `ambiguous` (the case `resolveUnique` collapsed to undefined)', () => {
    const st = new SymbolTable(); st.declare('csharp', 'A', 'src/b.cs'); st.declare('csharp', 'A', 'src/c.cs');
    const r = makeResolver({ ownerIndex: owner, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.classify({ kind: 'symbol', symbolKey: 'A' }, 'src/a.cs', 'csharp')).toEqual({ kind: 'ambiguous' });
  });
  it('symbol: no definition is `absent`', () => {
    const r = makeResolver({ ownerIndex: owner, symbolTable: new SymbolTable(), resolvePathToFile: () => undefined });
    expect(r.classify({ kind: 'symbol', symbolKey: 'Nope' }, 'src/a.cs', 'csharp')).toEqual({ kind: 'absent' });
  });
  it('symbol: a UNIQUE but UNMAPPED definition is `absent` (D7 non-event — continue, never ambiguous)', () => {
    const st = new SymbolTable(); st.declare('csharp', 'X.Y', 'vendor/x.cs'); // ownerOf(vendor/x.cs) = undefined
    const r = makeResolver({ ownerIndex: owner, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.classify({ kind: 'symbol', symbolKey: 'X.Y' }, 'src/a.cs', 'csharp')).toEqual({ kind: 'absent' });
  });
  it('path: a mapped file is `resolved`; the path axis never yields `ambiguous`', () => {
    const r = makeResolver({ ownerIndex: owner, symbolTable: new SymbolTable(), resolvePathToFile: () => 'src/b.cs' });
    expect(r.classify({ kind: 'path', specifier: './b' }, 'src/a.cs', 'csharp')).toEqual({
      kind: 'resolved', owner: 'b', resolvedFile: 'src/b.cs',
    });
  });
  it('path: an unresolved specifier is `absent`', () => {
    const r = makeResolver({ ownerIndex: owner, symbolTable: new SymbolTable(), resolvePathToFile: () => undefined });
    expect(r.classify({ kind: 'path', specifier: './nope' }, 'src/a.cs', 'csharp')).toEqual({ kind: 'absent' });
  });
  it('path: a resolved-but-UNMAPPED file is `absent` (D7)', () => {
    const r = makeResolver({ ownerIndex: owner, symbolTable: new SymbolTable(), resolvePathToFile: () => 'vendor/x.cs' });
    expect(r.classify({ kind: 'path', specifier: './x' }, 'src/a.cs', 'csharp')).toEqual({ kind: 'absent' });
  });
});

// Ruby root-anchoring: a multi-segment constant `A::B::C` resolves to an in-repo
// declaration ONLY when its ROOT `A` is itself a declared in-repo symbol. A compact
// reopening of an external constant (`module Rack::Handler` with no in-repo `Rack`) is thus
// silenced — the zero-FP fix for the sinatra `defined?(Rackup::Handler)` mis-binding.
describe('resolver — Ruby root-anchoring (multi-segment resolves only when its ROOT is in-repo)', () => {
  const rbOwner = { ownerOf: (f) => (f === 'lib/x.rb' ? 'x' : undefined) };
  const rubyTable = (...decls) => {
    const st = new SymbolTable();
    for (const [k, f] of decls) st.declare('ruby', k, f);
    return st;
  };

  it('classify: a compact constant whose ROOT is NOT in-repo is `absent` (reopened-external)', () => {
    const st = rubyTable(['Rackup::Handler', 'lib/x.rb']); // only the compact key; `Rackup` unanchored
    const r = makeResolver({ ownerIndex: rbOwner, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.classify({ kind: 'symbol', symbolKey: 'Rackup::Handler' }, 'lib/a.rb', 'ruby')).toEqual({ kind: 'absent' });
  });
  it('resolve: a root-unanchored compact constant does not resolve', () => {
    const st = rubyTable(['Rackup::Handler', 'lib/x.rb']);
    const r = makeResolver({ ownerIndex: rbOwner, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.resolve({ kind: 'symbol', symbolKey: 'Rackup::Handler' }, 'lib/a.rb', 'ruby')).toBeUndefined();
  });
  it('classify: when the ROOT is anchored in-repo (a bare `module Rackup`), the constant resolves', () => {
    const st = rubyTable(['Rackup', 'lib/x.rb'], ['Rackup::Handler', 'lib/x.rb']);
    const r = makeResolver({ ownerIndex: rbOwner, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.classify({ kind: 'symbol', symbolKey: 'Rackup::Handler' }, 'lib/a.rb', 'ruby')).toEqual({
      kind: 'resolved', owner: 'x', resolvedFile: 'lib/x.rb',
    });
  });
  it('resolve: a root-anchored constant resolves to its owner', () => {
    const st = rubyTable(['Rackup', 'lib/x.rb'], ['Rackup::Handler', 'lib/x.rb']);
    const r = makeResolver({ ownerIndex: rbOwner, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.resolve({ kind: 'symbol', symbolKey: 'Rackup::Handler' }, 'lib/a.rb', 'ruby')).toEqual({
      owner: 'x', resolvedFile: 'lib/x.rb',
    });
  });
  it('a single-segment Ruby constant is its own root → not subject to the guard', () => {
    const st = rubyTable(['Helper', 'lib/x.rb']);
    const r = makeResolver({ ownerIndex: rbOwner, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.classify({ kind: 'symbol', symbolKey: 'Helper' }, 'lib/a.rb', 'ruby')).toEqual({
      kind: 'resolved', owner: 'x', resolvedFile: 'lib/x.rb',
    });
  });
  it('RUBY-ONLY: a C# `A.B` resolves even though its root `A` is not a standalone symbol', () => {
    const st = new SymbolTable(); st.declare('csharp', 'A.B', 'src/b.cs');
    const r = makeResolver({ ownerIndex: owner, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.classify({ kind: 'symbol', symbolKey: 'A.B' }, 'src/a.cs', 'csharp')).toEqual({
      kind: 'resolved', owner: 'b', resolvedFile: 'src/b.cs',
    });
  });
});

// SymbolTable defCount/has — the count accessors the tri-state probe is built on.
describe('SymbolTable.defCount / has', () => {
  it('counts distinct defining files and reports presence', () => {
    const st = new SymbolTable();
    expect(st.defCount('csharp', 'A')).toBe(0);
    expect(st.has('csharp', 'A')).toBe(false);
    st.declare('csharp', 'A', 'src/b.cs');
    expect(st.defCount('csharp', 'A')).toBe(1);
    expect(st.has('csharp', 'A')).toBe(true);
    st.declare('csharp', 'A', 'src/c.cs');
    expect(st.defCount('csharp', 'A')).toBe(2);
    expect(st.has('csharp', 'A')).toBe(true);
    // resolveUnique is unchanged: exactly-one-or-undefined.
    expect(st.resolveUnique('csharp', 'A')).toBeUndefined();
  });
});

describe('resolver — Ruby lexical gates and external roots', () => {
  const rbOwner = { ownerOf: (f) => (f.startsWith('lib/') ? f.split('/')[1] : undefined) };
  const table = (...decls) => {
    const st = new SymbolTable();
    for (const [k, f] of decls) st.declare('ruby', k, f);
    return st;
  };
  const resolverFor = (st) =>
    makeResolver({ ownerIndex: rbOwner, symbolTable: st, resolvePathToFile: () => undefined });

  it('a core class reopened in-repo is external: absent, even as the only declaration', () => {
    const r = resolverFor(table(['String', 'lib/coreext/string.rb']));
    expect(r.classify({ kind: 'symbol', symbolKey: 'String' }, 'lib/a/x.rb', 'ruby')).toEqual({ kind: 'absent' });
    expect(r.resolve({ kind: 'symbol', symbolKey: 'String' }, 'lib/a/x.rb', 'ruby')).toBeUndefined();
    expect(r.resolveFile({ kind: 'symbol', symbolKey: 'String' }, 'lib/a/x.rb', 'ruby')).toBeUndefined();
  });

  it('a framework namespace reopened by a nested module is external', () => {
    const r = resolverFor(table(['ActiveRecord', 'lib/init/ar.rb'], ['ActiveRecord::Base', 'lib/init/ar.rb']));
    expect(r.classify({ kind: 'symbol', symbolKey: 'ActiveRecord::Base' }, 'lib/a/x.rb', 'ruby')).toEqual({ kind: 'absent' });
  });

  it('rubyAnchor: the first segment exists but the member does not → ambiguous (stop, never fall through)', () => {
    const r = resolverFor(table(['Shop', 'lib/shop/s.rb'], ['Shop::Billing', 'lib/shop/s.rb']));
    const hint = { kind: 'symbol', symbolKey: 'Shop::Billing::Invoice', rubyAnchor: 'Shop::Billing' };
    expect(r.classify(hint, 'lib/a/x.rb', 'ruby')).toEqual({ kind: 'ambiguous' });
    expect(r.resolve(hint, 'lib/a/x.rb', 'ruby')).toBeUndefined();
  });

  it('rubyAnchor: the first segment does not exist either → absent (continue outward)', () => {
    const r = resolverFor(table(['Shop', 'lib/shop/s.rb']));
    const hint = { kind: 'symbol', symbolKey: 'Shop::Billing::Invoice', rubyAnchor: 'Shop::Billing' };
    expect(r.classify(hint, 'lib/a/x.rb', 'ruby')).toEqual({ kind: 'absent' });
  });

  it('rubyInheritGuard: a same-named nested constant anywhere silences the top-level fallback', () => {
    const r = resolverFor(table(['Order', 'lib/models/order.rb'], ['Admin', 'lib/admin/o.rb'], ['Admin::Order', 'lib/admin/o.rb']));
    const guarded = { kind: 'symbol', symbolKey: 'Order', rubyInheritGuard: 'Order' };
    expect(r.classify(guarded, 'lib/a/x.rb', 'ruby')).toEqual({ kind: 'ambiguous' });
    const r2 = resolverFor(table(['Order', 'lib/models/order.rb']));
    expect(r2.classify(guarded, 'lib/a/x.rb', 'ruby')).toEqual({
      kind: 'resolved', owner: 'models', resolvedFile: 'lib/models/order.rb',
    });
  });
});

// Java and Kotlin share one JVM namespace (symbol-table.ts); Kotlin star imports and Java's
// source-root-miss fallback collapse by owner; a Kotlin file's incompleteness markers only
// ever keep an ambiguity, never create a binding.
describe('resolver — the shared JVM namespace', () => {
  const owners = { 'k/A.kt': 'k', 'j/B.java': 'j', 'x/X.kt': 'x', 'y/Y.kt': 'y', 'k/A2.kt': 'k' };
  const ownerIndex = { ownerOf: (f) => owners[f] };
  const mk = (st, probe = () => undefined) =>
    makeResolver({ ownerIndex, symbolTable: st, resolvePathToFile: probe });

  it('a Kotlin symbol resolves to a Java declaration and a Java inline FQN to a Kotlin one', () => {
    const st = new SymbolTable();
    st.declare('java', 'a.B', 'j/B.java');
    st.declare('kotlin', 'a.A', 'k/A.kt');
    const r = mk(st);
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.B' }, 'k/A.kt', 'kotlin')).toEqual({ kind: 'resolved', owner: 'j', resolvedFile: 'j/B.java' });
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.A' }, 'j/B.java', 'java')).toEqual({ kind: 'resolved', owner: 'k', resolvedFile: 'k/A.kt' });
    // other languages keep their own namespace
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.B' }, 'z.cs', 'csharp')).toEqual({ kind: 'absent' });
  });

  it('a Java import the source-root probe misses falls back to the JVM namespace (type, and package by owner)', () => {
    const st = new SymbolTable();
    st.declare('kotlin', 'a.A', 'k/A.kt');
    st.declare('kotlin', 'a.A2', 'k/A2.kt');
    st.declare('kotlin', 's.X', 'x/X.kt');
    st.declare('kotlin', 's.Y', 'y/Y.kt');
    const r = mk(st);
    expect(r.classify({ kind: 'path', specifier: 'a.A' }, 'j/B.java', 'java')).toEqual({ kind: 'resolved', owner: 'k', resolvedFile: 'k/A.kt' });
    expect(r.classify({ kind: 'path', specifier: 'a', isPackage: true }, 'j/B.java', 'java')).toMatchObject({ kind: 'resolved', owner: 'k' });
    expect(r.classify({ kind: 'path', specifier: 's', isPackage: true }, 'j/B.java', 'java')).toEqual({ kind: 'ambiguous' });
    expect(r.resolveFile({ kind: 'path', specifier: 'a.A' }, 'j/B.java', 'java')).toBe('k/A.kt');
    // a probe HIT is never second-guessed, and a non-Java path miss never falls back
    expect(mk(st, () => 'j/B.java').classify({ kind: 'path', specifier: 'a.A' }, 'x/X.kt', 'java')).toMatchObject({ kind: 'resolved', owner: 'j' });
    expect(r.classify({ kind: 'path', specifier: 'a.A' }, 'z.php', 'php')).toEqual({ kind: 'absent' });
  });

  it('a Kotlin star hint `<pkg>.*` collapses the package by owner; a classifier star binds the classifier', () => {
    const st = new SymbolTable();
    st.declare('kotlin', 'a.A', 'k/A.kt');
    st.declare('kotlin', 'a.f', 'k/A2.kt');
    st.declare('kotlin', 'a.sub.Z', 'x/X.kt'); // a sub-package member is not a member of `a`
    st.declare('kotlin', 'e.Colors', 'y/Y.kt');
    const r = mk(st);
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.*' }, 'j/B.java', 'kotlin')).toMatchObject({ kind: 'resolved', owner: 'k' });
    expect(r.classify({ kind: 'symbol', symbolKey: 'e.Colors.*' }, 'j/B.java', 'kotlin')).toMatchObject({ kind: 'resolved', owner: 'y' });
    expect(r.classify({ kind: 'symbol', symbolKey: 'nothing.*' }, 'j/B.java', 'kotlin')).toEqual({ kind: 'absent' });
    st.declare('kotlin', 'a.Other', 'x/X.kt');
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.*' }, 'j/B.java', 'kotlin')).toEqual({ kind: 'ambiguous' });
  });

  it('incompleteness markers: never bind alone, keep the ambiguity of another file, cover only their own package', () => {
    const st = new SymbolTable();
    st.declare('kotlin', 'a.*', 'x/X.kt'); // x may declare anything in package `a`
    st.declare('kotlin', 'a.T', 'y/Y.kt');
    st.declare('kotlin', 'a.b.C', 'y/Y.kt');
    st.declare('kotlin', 'a.U', 'x/X.kt');
    const r = mk(st);
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.Nowhere' }, 'k/A.kt', 'kotlin')).toEqual({ kind: 'absent' });
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.T' }, 'k/A.kt', 'kotlin')).toEqual({ kind: 'ambiguous' });
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.U' }, 'k/A.kt', 'kotlin')).toMatchObject({ kind: 'resolved', owner: 'x' });
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.b.C' }, 'k/A.kt', 'kotlin')).toMatchObject({ kind: 'resolved', owner: 'y' });
    // the Java fallback honours the same markers
    expect(r.classify({ kind: 'path', specifier: 'a.T' }, 'j/B.java', 'java')).toEqual({ kind: 'ambiguous' });
  });

  it('a type-members marker `<pkg>.<T>+*` keeps a nested key ambiguous but leaves the type itself alone', () => {
    const st = new SymbolTable();
    st.declare('kotlin', 'p.Box', 'x/X.kt');
    st.declare('kotlin', 'p.Box+*', 'x/X.kt');
    st.declare('kotlin', 'q.Box', 'y/Y.kt');
    st.declare('kotlin', 'q.Box+Inner', 'y/Y.kt');
    st.declare('kotlin', 'q.Box+*', 'k/A.kt'); // another file lost members of a same-named q.Box
    const r = mk(st);
    expect(r.classify({ kind: 'symbol', symbolKey: 'p.Box' }, 'k/A.kt', 'kotlin')).toMatchObject({ kind: 'resolved', owner: 'x' });
    expect(r.classify({ kind: 'symbol', symbolKey: 'q.Box.Inner' }, 'j/B.java', 'kotlin')).toEqual({ kind: 'ambiguous' });
  });
});

describe('resolver — JVM route edge branches', () => {
  it('resolveFile follows the JVM route for symbols, stars and Java probe misses', () => {
    const st = new SymbolTable();
    st.declare('kotlin', 'a.A', 'k/A.kt');
    st.declare('kotlin', 'a.B', 'x/B.kt');
    st.declare('kotlin', 'u.U', 'vendor/U.kt'); // unmapped
    const owners = { 'k/A.kt': 'k', 'x/B.kt': 'x' };
    const r = makeResolver({ ownerIndex: { ownerOf: (f) => owners[f] }, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.resolveFile({ kind: 'symbol', symbolKey: 'a.A' }, 'z.kt', 'kotlin')).toBe('k/A.kt');
    expect(r.resolveFile({ kind: 'symbol', symbolKey: 'a.*' }, 'z.kt', 'kotlin')).toBeUndefined(); // split → ambiguous
    expect(r.resolveFile({ kind: 'symbol', symbolKey: 'u.*' }, 'z.kt', 'kotlin')).toBe('vendor/U.kt'); // no owner → a file anyway
    expect(r.classify({ kind: 'symbol', symbolKey: 'u.*' }, 'z.kt', 'kotlin')).toEqual({ kind: 'absent' });
    expect(r.resolveFile({ kind: 'path', specifier: 'a.A' }, 'z.java', 'java')).toBe('k/A.kt');
    expect(r.resolveFile({ kind: 'path', specifier: 'nope.X' }, 'z.java', 'java')).toBeUndefined();
    expect(r.resolve({ kind: 'path', specifier: 'a.A' }, 'z.java', 'java')).toEqual({ owner: 'k', resolvedFile: 'k/A.kt' });
    expect(r.resolve({ kind: 'path', specifier: 'a', isPackage: true }, 'z.java', 'java')).toBeUndefined();
    expect(r.resolve({ kind: 'symbol', symbolKey: 'a.B' }, 'z.kt', 'kotlin')).toEqual({ owner: 'x', resolvedFile: 'x/B.kt' });
    expect(r.resolve({ kind: 'symbol', symbolKey: 'u.U' }, 'z.kt', 'kotlin')).toBeUndefined();
  });

  it('a star over a package with an unmapped file still collapses to the one owner', () => {
    const st = new SymbolTable();
    st.declare('kotlin', 'a.A', 'k/A.kt');
    st.declare('kotlin', 'a.V', 'vendor/V.kt');
    const r = makeResolver({ ownerIndex: { ownerOf: (f) => (f === 'k/A.kt' ? 'k' : undefined) }, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.*' }, 'z.kt', 'kotlin')).toEqual({ kind: 'resolved', owner: 'k', resolvedFile: 'k/A.kt' });
  });

  it('a set / nestedOnly hint in a JVM language takes the generic symbol route', () => {
    const st = new SymbolTable();
    st.declare('java', 'a.A', 'k/A.kt');
    const r = makeResolver({ ownerIndex: { ownerOf: () => 'k' }, symbolTable: st, resolvePathToFile: () => undefined });
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.A', set: [{ symbolKey: 'a.A' }] }, 'z.java', 'java')).toMatchObject({ kind: 'resolved' });
    expect(r.resolveFile({ kind: 'symbol', symbolKey: 'a.A', nestedOnly: true }, 'z.java', 'java')).toBeUndefined();
    expect(r.resolveFile({ kind: 'symbol', symbolKey: 'X' }, 'z.rb', 'ruby')).toBeUndefined();
  });
});

// B4: ambiguity is counted by OWNER NODE, not by file. A declaration split across several files
// of ONE node (C# partial classes, `Result`/`Result<T>` in separate files, Kotlin expect/actual,
// overloads spread over files) names exactly one target; only a split across 2+ nodes — or one
// involving an unmapped file — stays ambiguous. Language-agnostic by construction.
describe('resolver — owner-node ambiguity (B4)', () => {
  const byDir = { ownerOf: (f) => (f.startsWith('vendor/') ? undefined : f.split('/')[1]) };
  for (const language of ['csharp', 'kotlin']) {
    it(`${language}: 2 files of the SAME node resolve to that node (first file reported)`, () => {
      const st = new SymbolTable();
      st.declare(language, 'app.Thing', 'src/core/b.x');
      st.declare(language, 'app.Thing', 'src/core/a.x');
      const r = makeResolver({ ownerIndex: byDir, symbolTable: st, resolvePathToFile: () => undefined });
      expect(r.classify({ kind: 'symbol', symbolKey: 'app.Thing' }, 'src/use/u.x', language)).toEqual({
        kind: 'resolved', owner: 'core', resolvedFile: 'src/core/a.x',
      });
      expect(r.resolve({ kind: 'symbol', symbolKey: 'app.Thing' }, 'src/use/u.x', language)).toEqual({
        owner: 'core', resolvedFile: 'src/core/a.x',
      });
    });
    it(`${language}: files in 2 different nodes stay ambiguous`, () => {
      const st = new SymbolTable();
      st.declare(language, 'app.Thing', 'src/core/a.x');
      st.declare(language, 'app.Thing', 'src/other/a.x');
      const r = makeResolver({ ownerIndex: byDir, symbolTable: st, resolvePathToFile: () => undefined });
      expect(r.classify({ kind: 'symbol', symbolKey: 'app.Thing' }, 'src/use/u.x', language)).toEqual({ kind: 'ambiguous' });
      expect(r.resolve({ kind: 'symbol', symbolKey: 'app.Thing' }, 'src/use/u.x', language)).toBeUndefined();
    });
    it(`${language}: a mapped file plus an UNMAPPED file stays ambiguous (the unmapped one may be the binding)`, () => {
      const st = new SymbolTable();
      st.declare(language, 'app.Thing', 'src/core/a.x');
      st.declare(language, 'app.Thing', 'vendor/a.x');
      const r = makeResolver({ ownerIndex: byDir, symbolTable: st, resolvePathToFile: () => undefined });
      expect(r.classify({ kind: 'symbol', symbolKey: 'app.Thing' }, 'src/use/u.x', language)).toEqual({ kind: 'ambiguous' });
    });
  }
  it('a symbol SET (CS0104) whose members all live in one node resolves to it', () => {
    const st = new SymbolTable();
    st.declare('csharp', 'A.Foo', 'src/core/a.cs');
    st.declare('csharp', 'B.Foo', 'src/core/b.cs');
    const r = makeResolver({ ownerIndex: byDir, symbolTable: st, resolvePathToFile: () => undefined });
    const set = [{ symbolKey: 'A.Foo' }, { symbolKey: 'B.Foo' }];
    expect(r.classify({ kind: 'symbol', symbolKey: 'A.Foo', set }, 'src/use/u.cs', 'csharp')).toEqual({
      kind: 'resolved', owner: 'core', resolvedFile: 'src/core/a.cs',
    });
  });
});

// B4 meets the Kotlin incompleteness markers: an unreadable declaration in the SAME node as the
// definers can only name that node again, so it never makes the lookup ambiguous; a marker in a
// DIFFERENT node (or an unmapped file) still fails closed.
describe('resolver — owner collapse with Kotlin incompleteness markers', () => {
  const byDir = { ownerOf: (f) => (f.startsWith('vendor/') ? undefined : f.split('/')[1]) };
  const mk = (st) => makeResolver({ ownerIndex: byDir, symbolTable: st, resolvePathToFile: () => undefined });

  it('a marker file in the same node as the definer keeps the edge', () => {
    const st = new SymbolTable();
    st.declare('kotlin', 'a.T', 'src/core/T.kt');
    st.declare('kotlin', 'a.*', 'src/core/Broken.kt');
    expect(mk(st).classify({ kind: 'symbol', symbolKey: 'a.T' }, 'src/use/U.kt', 'kotlin')).toEqual({
      kind: 'resolved', owner: 'core', resolvedFile: 'src/core/T.kt',
    });
  });

  it('a marker file in another node, or an unmapped one, keeps the lookup ambiguous', () => {
    const st = new SymbolTable();
    st.declare('kotlin', 'a.T', 'src/core/T.kt');
    st.declare('kotlin', 'a.*', 'src/other/Broken.kt');
    expect(mk(st).classify({ kind: 'symbol', symbolKey: 'a.T' }, 'src/use/U.kt', 'kotlin')).toEqual({ kind: 'ambiguous' });
    const st2 = new SymbolTable();
    st2.declare('kotlin', 'a.T', 'src/core/T.kt');
    st2.declare('kotlin', 'a.*', 'vendor/Broken.kt');
    expect(mk(st2).classify({ kind: 'symbol', symbolKey: 'a.T' }, 'src/use/U.kt', 'kotlin')).toEqual({ kind: 'ambiguous' });
  });

  it('several definers of one node plus a same-node marker bind; a foreign marker still silences them', () => {
    const st = new SymbolTable();
    st.declare('kotlin', 'a.T', 'src/core/T.kt');
    st.declare('kotlin', 'a.T', 'src/core/TActual.kt');
    st.declare('kotlin', 'a.T+*', 'src/core/TActual.kt');
    const r = mk(st);
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.T' }, 'src/use/U.kt', 'kotlin')).toMatchObject({ kind: 'resolved', owner: 'core' });
    st.declare('kotlin', 'a.*', 'src/other/Broken.kt');
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.T' }, 'src/use/U.kt', 'kotlin')).toEqual({ kind: 'ambiguous' });
  });

  it('a lone unmapped definer with a marker elsewhere stays ambiguous (fail closed, as before)', () => {
    const st = new SymbolTable();
    st.declare('kotlin', 'a.T', 'vendor/T.kt');
    st.declare('kotlin', 'a.*', 'src/core/Broken.kt');
    expect(mk(st).classify({ kind: 'symbol', symbolKey: 'a.T' }, 'src/use/U.kt', 'kotlin')).toEqual({ kind: 'ambiguous' });
    const st2 = new SymbolTable();
    st2.declare('kotlin', 'a.T', 'vendor/T.kt');
    expect(mk(st2).classify({ kind: 'symbol', symbolKey: 'a.T' }, 'src/use/U.kt', 'kotlin')).toEqual({ kind: 'absent' });
  });
});

// Issue 014: the C# reference filter. `reach` is the predicate buildCsharpReachability builds; here a hand-written one, so the resolver's use of it is held apart from the graph.
describe('resolver — the C# reach filter', () => {
  const owners = { ownerOf: (f) => f.split('/')[1] };
  const reachBy = (table) => (from, target) => table[`${from}>${target}`] ?? 'reachable';
  const mk = (st, reach) => makeResolver({ ownerIndex: owners, symbolTable: st, resolvePathToFile: () => undefined, reach });
  const hint = { kind: 'symbol', symbolKey: 'N.T' };

  it('drops a definer the caller cannot reach, so the candidate is absent, never a binding', () => {
    const st = new SymbolTable(); st.declare('csharp', 'N.T', 'src/lib/T.cs');
    const reach = reachBy({ 'src/app/A.cs>src/lib/T.cs': 'unreachable' });
    expect(mk(st, reach).classify(hint, 'src/app/A.cs', 'csharp')).toEqual({ kind: 'absent' });
    expect(mk(st, reach).resolve(hint, 'src/app/A.cs', 'csharp')).toBeUndefined();
    expect(mk(st, reach).resolveFile(hint, 'src/app/A.cs', 'csharp')).toBeUndefined();
    expect(mk(st, undefined).classify(hint, 'src/app/A.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'lib' });
  });

  it('turns an ambiguity between two owners into a binding when one of them is out of reach', () => {
    const st = new SymbolTable(); st.declare('csharp', 'N.T', 'src/one/T.cs'); st.declare('csharp', 'N.T', 'src/two/T.cs');
    const reach = reachBy({ 'src/app/A.cs>src/two/T.cs': 'unreachable' });
    expect(mk(st, undefined).classify(hint, 'src/app/A.cs', 'csharp')).toEqual({ kind: 'ambiguous' });
    expect(mk(st, reach).classify(hint, 'src/app/A.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'one', resolvedFile: 'src/one/T.cs' });
    expect(mk(st, reach).resolveFile(hint, 'src/app/A.cs', 'csharp')).toBe('src/one/T.cs');
  });

  it('prefers the definer of the caller\'s own project to a referenced one of the same name', () => {
    const st = new SymbolTable(); st.declare('csharp', 'N.T', 'src/app/T.cs'); st.declare('csharp', 'N.T', 'src/lib/T.cs');
    const reach = reachBy({ 'src/app/A.cs>src/app/T.cs': 'same' });
    expect(mk(st, reach).classify(hint, 'src/app/A.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'app' });
    // Without a definer of its own project the two referenced owners stay ambiguous.
    expect(mk(st, reachBy({})).classify(hint, 'src/app/A.cs', 'csharp')).toEqual({ kind: 'ambiguous' });
  });

  it('filters the members of a set hint, each of them', () => {
    const st = new SymbolTable(); st.declare('csharp', 'A.T', 'src/one/T.cs'); st.declare('csharp', 'B.T', 'src/two/T.cs');
    const set = { kind: 'symbol', symbolKey: 'A.T', set: [{ symbolKey: 'A.T' }, { symbolKey: 'B.T' }] };
    const reach = reachBy({ 'src/app/A.cs>src/two/T.cs': 'unreachable' });
    expect(mk(st, undefined).classify(set, 'src/app/A.cs', 'csharp')).toEqual({ kind: 'ambiguous' });
    expect(mk(st, reach).classify(set, 'src/app/A.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'one' });
  });

  it('drops a definer in another project whose declarations of the name are all internal, unless its project names the caller as a friend', () => {
    const st = new SymbolTable();
    st.declare('csharp', 'N.T', 'src/one/T.cs');
    st.declare('csharp', 'N.T', 'src/two/T.cs'); st.declare('csharp', 'internal:N.T', 'src/two/T.cs');
    const withFriends = (friend) => Object.assign(reachBy({}), { internalsVisible: (from, target) => target !== 'src/two/T.cs' || friend });
    expect(mk(st, withFriends(false)).classify(hint, 'src/app/A.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'one', resolvedFile: 'src/one/T.cs' });
    expect(mk(st, withFriends(true)).classify(hint, 'src/app/A.cs', 'csharp')).toEqual({ kind: 'ambiguous' });
    // Without the member nothing is read as internal, and a caller of the same compilation sees the internal one.
    expect(mk(st, reachBy({})).classify(hint, 'src/app/A.cs', 'csharp')).toEqual({ kind: 'ambiguous' });
    const sameAsTwo = Object.assign(reachBy({ 'src/two/B.cs>src/two/T.cs': 'same' }), { internalsVisible: () => false });
    expect(mk(st, sameAsTwo).classify(hint, 'src/two/B.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'two' });
  });

  it('keeps a definer that declares one of the keys a hint reads without the internal marker', () => {
    const st = new SymbolTable();
    st.declare('csharp', 'N.Outer', 'src/two/T.cs');
    st.declare('csharp', 'N.Outer+T', 'src/two/T.cs');
    st.declare('csharp', 'N.Outer.T', 'src/two/T.cs'); st.declare('csharp', 'internal:N.Outer.T', 'src/two/T.cs');
    const closed = Object.assign(reachBy({}), { internalsVisible: () => false });
    expect(mk(st, closed).classify({ kind: 'symbol', symbolKey: 'N.Outer.T' }, 'src/app/A.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'two' });
    st.declare('csharp', 'internal:N.Outer+T', 'src/two/T.cs');
    expect(mk(st, closed).classify({ kind: 'symbol', symbolKey: 'N.Outer.T' }, 'src/app/A.cs', 'csharp')).toEqual({ kind: 'absent' });
  });

  it('never consults the predicate for another language', () => {
    const st = new SymbolTable(); st.declare('kotlin', 'N.T', 'src/lib/T.kt');
    const asked = [];
    const reach = (from, target) => { asked.push([from, target]); return 'unreachable'; };
    expect(mk(st, reach).classify(hint, 'src/app/A.kt', 'kotlin')).toMatchObject({ kind: 'resolved', owner: 'lib' });
    expect(asked).toEqual([]);
  });
});

// Issue 164: the global Program of C# is one name whether declared or synthesized from top-level statements.
describe('resolver — the C# global Program under a reference graph', () => {
  const owners = { ownerOf: (f) => f.split('/')[1] };
  const mk = (st, reach) => makeResolver({ ownerIndex: owners, symbolTable: st, resolvePathToFile: () => undefined, reach });
  const IMPLICIT = '<Program>$';
  const program = { kind: 'symbol', symbolKey: 'Program' };
  const implicit = { kind: 'symbol', symbolKey: IMPLICIT };
  const declared = () => {
    const st = new SymbolTable();
    st.declare('csharp', 'Program', 'src/lib/Program.cs');
    st.declare('csharp', IMPLICIT, 'src/web/Program.cs');
    return st;
  };
  const known = (answers) => (from, target) => answers[target] ?? 'reachable';

  it('chooses among the declared and the implicit class together when the graph says something about each', () => {
    const both = known({});
    expect(mk(declared(), both).classify(program, 'src/tests/T.cs', 'csharp')).toEqual({ kind: 'ambiguous' });
    expect(mk(declared(), both).classify(implicit, 'src/tests/T.cs', 'csharp')).toEqual({ kind: 'ambiguous' });
    const onlyImplicit = known({ 'src/lib/Program.cs': 'unreachable' });
    expect(mk(declared(), onlyImplicit).classify(program, 'src/tests/T.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'web' });
    const own = known({ 'src/web/Program.cs': 'same' });
    expect(mk(declared(), own).classify(program, 'src/web/H.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'web' });
  });

  it('keeps the order of a pass without a graph, the declared class first, where the graph can say nothing about a definer', () => {
    const unknown = known({ 'src/web/Program.cs': 'unknown' });
    expect(mk(declared(), unknown).classify(program, 'src/tests/T.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'lib' });
    expect(mk(declared(), unknown).classify(implicit, 'src/tests/T.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'web' });
    const droppedStill = known({ 'src/web/Program.cs': 'unknown', 'src/lib/Program.cs': 'unreachable' });
    expect(mk(declared(), droppedStill).classify(program, 'src/tests/T.cs', 'csharp')).toEqual({ kind: 'absent' });
  });

  it('does not join the two keys without a graph, and does not join a nested or set hint', () => {
    expect(mk(declared(), undefined).classify(program, 'src/tests/T.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'lib' });
    const nested = { kind: 'symbol', symbolKey: 'Program', nestedOnly: true };
    expect(mk(declared(), known({})).classify(nested, 'src/tests/T.cs', 'csharp')).toEqual({ kind: 'absent' });
    const set = { kind: 'symbol', symbolKey: 'Program', set: [{ symbolKey: 'Program' }] };
    expect(mk(declared(), known({})).classify(set, 'src/tests/T.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'lib' });
  });
});

// A same-package hint (Java, Kotlin) sees only the definers its source set can see: main code never sees a test class, a test sees main.
describe('resolver — same-package hints and source sets', () => {
  const jvmOwner = { ownerOf: (f) => ({ 'm/src/main/java/a/Owner.java': 'main', 'm/src/test/java/a/Owner.java': 'tests', 'm/src/test/java/a/Fixture.java': 'tests' })[f] };
  const table = () => {
    const st = new SymbolTable();
    st.declare('java', 'a.Owner', 'm/src/main/java/a/Owner.java');
    st.declare('java', 'a.Fixture', 'm/src/test/java/a/Fixture.java');
    return st;
  };
  const make = (st) => makeResolver({ ownerIndex: jvmOwner, symbolTable: st, resolvePathToFile: () => undefined });
  const fromMain = 'm/src/main/java/a/Use.java';
  const fromTest = 'm/src/test/java/a/UseTest.java';
  const same = (symbolKey) => ({ kind: 'symbol', symbolKey, samePackage: true });

  it('a test file sees main, a main file never sees a test class', () => {
    const r = make(table());
    expect(r.classify(same('a.Owner'), fromTest, 'java')).toEqual({ kind: 'resolved', owner: 'main', resolvedFile: 'm/src/main/java/a/Owner.java' });
    expect(r.classify(same('a.Fixture'), fromMain, 'java')).toEqual({ kind: 'absent' });
    expect(r.classify(same('a.Fixture'), fromTest, 'java')).toEqual({ kind: 'resolved', owner: 'tests', resolvedFile: 'm/src/test/java/a/Fixture.java' });
    expect(r.resolve(same('a.Fixture'), fromMain, 'java')).toBeUndefined();
    expect(r.resolveFile(same('a.Fixture'), fromMain, 'java')).toBeUndefined();
    expect(r.resolveFile(same('a.Owner'), fromTest, 'java')).toBe('m/src/main/java/a/Owner.java');
  });

  it('a hint without the flag counts every definer, as an import does', () => {
    const r = make(table());
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.Fixture' }, fromMain, 'java')).toEqual({ kind: 'resolved', owner: 'tests', resolvedFile: 'm/src/test/java/a/Fixture.java' });
  });

  it('a test copy of a main class: a test file sees both owners (ambiguous), a main file only its own', () => {
    const st = table();
    st.declare('java', 'a.Owner', 'm/src/test/java/a/Owner.java');
    const r = make(st);
    expect(r.classify(same('a.Owner'), fromTest, 'java')).toEqual({ kind: 'ambiguous' });
    // From main the test copy is not seen, so the main one binds alone.
    expect(r.classify(same('a.Owner'), fromMain, 'java')).toEqual({ kind: 'resolved', owner: 'main', resolvedFile: 'm/src/main/java/a/Owner.java' });
  });

  it('an incompleteness marker of an invisible source set creates no ambiguity', () => {
    const st = table();
    st.declare('kotlin', 'a.*', 'm/src/test/java/a/Fixture.java');
    const r = make(st);
    expect(r.classify(same('a.Owner'), fromMain, 'java').kind).toBe('resolved');
    expect(r.classify({ kind: 'symbol', symbolKey: 'a.Owner' }, fromMain, 'java').kind).toBe('ambiguous');
  });
});

// C#: a reading behind a nearer namespace or type the lookup stops at (`shadow`) binds nothing.
describe('resolver — C# shadowed readings', () => {
  const owners = { ownerOf: (f) => f.split('/')[1] };
  const mk = (st, reach) => makeResolver({ ownerIndex: owners, symbolTable: st, resolvePathToFile: () => undefined, reach });
  const table = () => {
    const st = new SymbolTable();
    st.declare('csharp', 'Models', 'src/global/Models.cs');
    st.declare('csharp', 'App.Models.Order', 'src/models/Order.cs');
    st.declare('csharp', 'App.Thing', 'src/thing/Thing.cs');
    st.declare('csharp', 'Program', 'src/lib/Program.cs');
    return st;
  };

  it('a hint is void when a shadow name is a namespace or a type of the repository, and binds when none is', () => {
    const r = mk(table());
    expect(r.classify({ kind: 'symbol', symbolKey: 'Models', shadow: ['App.Models'] }, 'src/c/C.cs', 'csharp')).toEqual({ kind: 'absent' });
    expect(r.classify({ kind: 'symbol', symbolKey: 'Models', shadow: ['App.Thing'] }, 'src/c/C.cs', 'csharp')).toEqual({ kind: 'absent' });
    expect(r.classify({ kind: 'symbol', symbolKey: 'Models', shadow: ['Web.Models'] }, 'src/c/C.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'global' });
    expect(r.resolve({ kind: 'symbol', symbolKey: 'Models', shadow: ['App.Models'] }, 'src/c/C.cs', 'csharp')).toBeUndefined();
    expect(r.resolveFile({ kind: 'symbol', symbolKey: 'Models', shadow: ['App.Models'] }, 'src/c/C.cs', 'csharp')).toBeUndefined();
  });

  it('a set member is void on its own shadow, the other members still count', () => {
    const r = mk(table());
    const set = [{ symbolKey: 'Models', shadow: ['App.Models'] }, { symbolKey: 'App.Thing' }];
    expect(r.classify({ kind: 'symbol', symbolKey: 'Models', set }, 'src/c/C.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'thing' });
  });

  it('a shadowed global Program is void under a reference graph too', () => {
    const reach = () => 'reachable';
    expect(mk(table(), reach).classify({ kind: 'symbol', symbolKey: 'Program', shadow: ['App.Thing'] }, 'src/c/C.cs', 'csharp')).toEqual({ kind: 'absent' });
    expect(mk(table(), reach).classify({ kind: 'symbol', symbolKey: 'Program', shadow: ['Web.Program'] }, 'src/c/C.cs', 'csharp')).toMatchObject({ kind: 'resolved', owner: 'lib' });
  });
});

// What a use comes to, beyond `classify`: `classifyUse` walks a use's candidates as the edge walk does and answers with what a consumer that judges the files itself needs. An ambiguous answer names its candidate files, sorted; `classify` answers exactly as before.
describe('resolver.classifyUse — an ambiguous answer names its candidate files', () => {
  const ownerOfPath = (f) => f.split('/').at(-2);
  const symbols = (...decls) => {
    const st = new SymbolTable();
    for (const [language, key, file] of decls) st.declare(language, key, file);
    return st;
  };
  const resolverOf = (st, resolvePathToFile = () => undefined, ownerOf = ownerOfPath) => makeResolver({ ownerIndex: { ownerOf }, symbolTable: st, resolvePathToFile });

  it('a Kotlin star import of a package two owners declare into names their files, and classify answers as before', () => {
    const r = resolverOf(symbols(['kotlin', 'com.acme.app.Order', 'k/other/Order.kt'], ['kotlin', 'com.acme.app.Clock', 'k/app/Clock.kt'], ['kotlin', 'com.acme.app.Tick', 'k/app/Tick.kt']));
    const star = { kind: 'symbol', symbolKey: 'com.acme.app.*' };
    expect(r.classify(star, 'k/use/Use.kt', 'kotlin')).toEqual({ kind: 'ambiguous' });
    expect(r.classifyUse([star], 'k/use/Use.kt', 'kotlin')).toEqual({ kind: 'ambiguous', candidates: ['k/app/Clock.kt', 'k/app/Tick.kt', 'k/other/Order.kt'] });
  });
  it('a JVM name declared by two owners names both files; a file whose declarations could not be read joins them', () => {
    const r = resolverOf(symbols(['java', 'com.a.Owner', 'b/b/Owner.java'], ['java', 'com.a.Owner', 'a/a/Owner.java']));
    expect(r.classifyUse([{ kind: 'symbol', symbolKey: 'com.a.Owner' }], 'c/c/Use.java', 'java')).toEqual({ kind: 'ambiguous', candidates: ['a/a/Owner.java', 'b/b/Owner.java'] });
    const marked = resolverOf(symbols(['kotlin', 'com.a.Owner', 'a/a/Owner.kt'], ['kotlin', 'com.a.*', 'z/z/Broken.kt']));
    expect(marked.classify({ kind: 'symbol', symbolKey: 'com.a.Owner' }, 'c/c/Use.kt', 'kotlin')).toEqual({ kind: 'ambiguous' });
    expect(marked.classifyUse([{ kind: 'symbol', symbolKey: 'com.a.Owner' }], 'c/c/Use.kt', 'kotlin')).toEqual({ kind: 'ambiguous', candidates: ['a/a/Owner.kt', 'z/z/Broken.kt'] });
  });
  it('a Java on-demand import the source roots do not hold, split between owners, names the package files', () => {
    const r = resolverOf(symbols(['java', 'com.acme.app.Order', 'm1/app/Order.java'], ['java', 'com.acme.app.Clock', 'm2/other/Clock.java']));
    expect(r.classifyUse([{ kind: 'path', specifier: 'com.acme.app', isPackage: true }], 'm3/use/Use.java', 'java')).toEqual({ kind: 'ambiguous', candidates: ['m1/app/Order.java', 'm2/other/Clock.java'] });
  });
  it('a C# partial type whose parts two owners declare names its parts, and an unmapped part counts as one', () => {
    const r = resolverOf(symbols(['csharp', 'Shop.Customer', 'src/people/Customer.cs'], ['csharp', 'Shop.Customer', 'src/generated/Customer.g.cs']));
    expect(r.classifyUse([{ kind: 'symbol', symbolKey: 'Shop.Customer' }], 'src/app/Uses.cs', 'csharp')).toEqual({ kind: 'ambiguous', candidates: ['src/generated/Customer.g.cs', 'src/people/Customer.cs'] });
    const unmapped = resolverOf(symbols(['csharp', 'Shop.Customer', 'src/people/Customer.cs'], ['csharp', 'Shop.Customer', 'gen/Customer.g.cs']), undefined, (f) => (f.startsWith('src/') ? ownerOfPath(f) : undefined));
    expect(unmapped.classifyUse([{ kind: 'symbol', symbolKey: 'Shop.Customer' }], 'src/app/Uses.cs', 'csharp')).toEqual({ kind: 'ambiguous', candidates: ['gen/Customer.g.cs', 'src/people/Customer.cs'] });
  });
  it('Ruby names the files of the namespace it stops at, and the files that may hand down a nested constant', () => {
    const anchored = resolverOf(symbols(['ruby', 'Shop', 'lib/shop/s.rb'], ['ruby', 'Shop::Billing', 'lib/shop/s.rb'], ['ruby', 'Shop::Billing', 'lib/shop/t.rb']));
    expect(anchored.classifyUse([{ kind: 'symbol', symbolKey: 'Shop::Billing::Invoice', rubyAnchor: 'Shop::Billing' }], 'lib/a/x.rb', 'ruby')).toEqual({ kind: 'ambiguous', candidates: ['lib/shop/s.rb', 'lib/shop/t.rb'] });
    const guarded = resolverOf(symbols(['ruby', 'Order', 'lib/models/order.rb'], ['ruby', 'Admin', 'lib/admin/o.rb'], ['ruby', 'Admin::Order', 'lib/admin/o.rb'], ['ruby', 'Shop::Order', 'lib/shop/o.rb']));
    expect(guarded.classifyUse([{ kind: 'symbol', symbolKey: 'Order', rubyInheritGuard: 'Order' }], 'lib/a/x.rb', 'ruby')).toEqual({ kind: 'ambiguous', candidates: ['lib/admin/o.rb', 'lib/models/order.rb', 'lib/shop/o.rb'] });
  });
  it('a Go package of the module whose files belong to two owners is ambiguous with its files, where classify answers absent', () => {
    const contents = new Map([['go.mod', 'module example.com/m\n'], ['service/a.go', 'package service'], ['service/b_gen.go', 'package service'], ['service/a_test.go', 'package service'], ['domain/order.go', 'package domain'], ['solo/x.go', 'package solo']]);
    const own = { 'service/a.go': 'app', 'service/b_gen.go': 'gen', 'service/a_test.go': 'app', 'domain/order.go': 'domain', 'solo/x.go': 'solo' };
    const ownerOf = (f) => own[f];
    const r = makeResolver({ ownerIndex: { ownerOf }, symbolTable: new SymbolTable(), resolvePathToFile: makeResolvePathToFile('/nonexistent', ownerOf, undefined, { files: listedFileView(contents.keys(), (p) => contents.get(p)) }) });
    const split = { kind: 'path', specifier: 'example.com/m/service', isPackage: true };
    expect(r.classify(split, 'domain/order.go', 'go')).toEqual({ kind: 'absent' });
    expect(r.classifyUse([split], 'domain/order.go', 'go')).toEqual({ kind: 'ambiguous', candidates: ['service/a.go', 'service/b_gen.go'] });
    // The edge walk passes a split package by, so a farther reading that binds is still the answer.
    expect(r.classifyUse([split, { kind: 'path', specifier: 'example.com/m/solo', isPackage: true }], 'domain/order.go', 'go')).toEqual({ kind: 'resolved', owner: 'solo', resolvedFile: 'solo/x.go' });
  });
  it('walks a use as the edge walk does: the first binding resolves, a nearer ambiguity ends the use', () => {
    const r = resolverOf(symbols(['csharp', 'App.A', 'src/a/A.cs'], ['csharp', 'Lib.A', 'src/x/A.cs'], ['csharp', 'Lib.A', 'src/y/A.cs']));
    expect(r.classifyUse([{ kind: 'symbol', symbolKey: 'App.Web.A' }, { kind: 'symbol', symbolKey: 'App.A' }], 'src/w/W.cs', 'csharp')).toEqual({ kind: 'resolved', owner: 'a', resolvedFile: 'src/a/A.cs' });
    expect(r.classifyUse([{ kind: 'symbol', symbolKey: 'Lib.A' }, { kind: 'symbol', symbolKey: 'App.A' }], 'src/w/W.cs', 'csharp')).toEqual({ kind: 'ambiguous', candidates: ['src/x/A.cs', 'src/y/A.cs'] });
    expect(r.classifyUse([], 'src/w/W.cs', 'csharp').kind).toBe('absent');
  });
});

// An absent answer of `classifyUse` says where the use points, where the readers can tell: `outside` (it leaves the repository), `unfollowed` (it names a place of the repository that binds no file) or `unowned` (it binds a file no owner maps); `classify` answers `{ kind: 'absent' }` as before.
describe('resolver.classifyUse — a use that binds no file says whether it leaves the repository', () => {
  const ownerOfPath = (f) => (f.startsWith('vendor/') ? undefined : f.split('/').at(-2));
  const resolverOf = (decls, resolvePathToFile = () => undefined) => {
    const st = new SymbolTable();
    for (const [language, key, file] of decls) st.declare(language, key, file);
    return makeResolver({ ownerIndex: { ownerOf: ownerOfPath }, symbolTable: st, resolvePathToFile });
  };
  const sym = (symbolKey, extra = {}) => ({ kind: 'symbol', symbolKey, ...extra });

  it('a file of the repository no owner maps is unowned, named, and the first such reading decides', () => {
    const r = resolverOf([['csharp', 'Gen.Thing', 'vendor/Thing.cs'], ['java', 'com.v.Lib', 'vendor/Lib.java']], (spec) => (spec === './v' ? 'vendor/v.ts' : undefined));
    expect(r.classify(sym('Gen.Thing'), 'src/a/A.cs', 'csharp')).toEqual({ kind: 'absent' });
    expect(r.classifyUse([sym('Gen.Thing'), sym('System.Thing')], 'src/a/A.cs', 'csharp')).toEqual({ kind: 'absent', reason: 'unowned', resolvedFile: 'vendor/Thing.cs' });
    expect(r.classifyUse([{ kind: 'path', specifier: './v' }], 'src/a/a.ts', 'typescript')).toEqual({ kind: 'absent', reason: 'unowned', resolvedFile: 'vendor/v.ts' });
    expect(r.classifyUse([sym('com.v.Lib')], 'src/a/A.kt', 'kotlin')).toEqual({ kind: 'absent', reason: 'unowned', resolvedFile: 'vendor/Lib.java' });
  });
  it('Java and Kotlin: a package the repository declares nothing in leaves it; a name of its own packages that binds nothing does not', () => {
    const r = resolverOf([['java', 'com.acme.app.Order', 'src/app/Order.java'], ['java', 'com.acme.app.Outer', 'src/app/Outer.java']]);
    const java = (hint) => r.classifyUse([hint], 'src/use/Use.java', 'java');
    expect(java({ kind: 'path', specifier: 'java.util.ArrayList' })).toEqual({ kind: 'absent', reason: 'outside' });
    expect(java({ kind: 'path', specifier: 'com.acme.app.Missing' })).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(java({ kind: 'path', specifier: 'com.acme.app.Outer.Missing' })).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(java({ kind: 'path', specifier: 'com.acme.app.gen', isPackage: true })).toEqual({ kind: 'absent', reason: 'outside' });
    expect(java({ kind: 'path', specifier: 'com.acme', isPackage: true })).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(java({ kind: 'path', specifier: 'Single' })).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(r.classifyUse([sym('kotlinx.coroutines.*')], 'src/use/Use.kt', 'kotlin')).toEqual({ kind: 'absent', reason: 'outside' });
    // A simple name of the file's own package: its readings read on, and a member type of a supertype the repository does not declare may be inherited from it.
    expect(r.classifyUse([sym('com.acme.app.Base+Missing', { samePackage: true }), sym('com.acme.app.Missing', { samePackage: true })], 'src/use/Use.java', 'java')).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(r.classifyUse([sym('com.acme.app.Order+Missing', { samePackage: true }), sym('com.acme.app.Missing', { samePackage: true }), sym('java.lang.Missing')], 'src/use/Use.java', 'java')).toEqual({ kind: 'absent', reason: 'outside' });
  });
  it('C#: a name only a namespace from elsewhere can give leaves it; a name read in the repository\'s namespaces, or through an alias of one, does not', () => {
    const r = resolverOf([['csharp', 'Shop.Core.Order', 'src/core/Order.cs'], ['csharp', 'Shop.App.Use', 'src/app/Use.cs'], ['csharp', 'Microsoft.AspNetCore.Hosting.Boot', 'src/host/Boot.cs'], ['csharp', 'Shop.App.Ext', 'src/app/Ext.cs']]);
    const cs = (...hints) => r.classifyUse(hints, 'src/app/Use.cs', 'csharp');
    const levels = (written, ...more) => [sym(`Shop.App.Use+${written}`, { within: 'Shop.App.Use' }), sym(`Shop.App.${written}`), sym(`Shop.${written}`), sym(written), ...more];
    expect(cs(...levels('StringBuilder', sym('System.Text.StringBuilder', { set: [{ symbolKey: 'System.Text.StringBuilder' }] })))).toEqual({ kind: 'absent', reason: 'outside' });
    expect(cs(...levels('Missing'))).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(cs(...levels('Missing', sym('Shop.Core.Missing', { set: [{ symbolKey: 'Shop.Core.Missing' }] })))).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(cs(...levels('Shop.Core.Gone', sym('System.Text.Shop.Core.Gone', { nestedOnly: true, set: [{ symbolKey: 'System.Text.Shop.Core.Gone', nestedOnly: true }] })))).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(cs(...levels('System.Console'))).toEqual({ kind: 'absent', reason: 'outside' });
    expect(cs(...levels('Microsoft.Extensions.Logging.ILogger'))).toEqual({ kind: 'absent', reason: 'outside' });
    expect(cs(sym('Shop.App.L.Gone'), sym('Shop.Core.Gone', { set: [{ symbolKey: 'Shop.Core.Gone' }, { symbolKey: 'L.Gone' }] }), sym('L.Gone'))).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(cs(sym('Shop.App.Lib.Thing'), sym('Other.Lib.Thing', { set: [{ symbolKey: 'Other.Lib.Thing' }, { symbolKey: 'Lib.Thing' }] }), sym('Lib.Thing'))).toEqual({ kind: 'absent', reason: 'outside' });
    expect(cs(sym('Shop.App.Where()'), sym('Where()'), sym('System.Linq.Where()'))).toEqual({ kind: 'absent', reason: 'outside' });
    expect(cs(sym('Shop.App.Ext#Shout()'), sym('Ext#Shout()'))).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(cs(sym('Shop.App.Lib#Shout()'), sym('Lib#Shout()'))).toEqual({ kind: 'absent', reason: 'outside' });
    // A nearer name of the repository the lookup stops at commits the use to the repository.
    expect(cs(sym('System.Text.Encoder', { shadow: ['Shop.Core'] }))).toEqual({ kind: 'absent', reason: 'unfollowed' });
    // An attribute: its written and suffixed readings, each a group of its own.
    const attribute = (written, suffixed) => sym(written[0].symbolKey, { attribute: { written, ...(suffixed === undefined ? {} : { suffixed }) } });
    expect(cs(attribute([sym('Shop.App.Serializable'), sym('Serializable')], [sym('Shop.App.SerializableAttribute'), sym('SerializableAttribute'), sym('System.SerializableAttribute')]))).toEqual({ kind: 'absent', reason: 'outside' });
    expect(cs(attribute([sym('Shop.App.MineAttribute'), sym('MineAttribute')]))).toEqual({ kind: 'absent', reason: 'unfollowed' });
  });
  it('says nothing where the readers cannot tell, and nothing for a path when the path function cannot explain', () => {
    const r = resolverOf([['ruby', 'Shop', 'lib/shop/s.rb']]);
    expect(r.classifyUse([sym('Missing')], 'lib/a/x.rb', 'ruby')).toEqual({ kind: 'absent' });
    expect(r.classifyUse([{ kind: 'path', specifier: 'react' }], 'src/a/a.ts', 'typescript')).toEqual({ kind: 'absent' });
    const explaining = Object.assign(() => undefined, { explainMiss: (spec) => (spec === 'react' ? 'outside' : undefined) });
    const told = resolverOf([], explaining);
    expect(told.classifyUse([{ kind: 'path', specifier: 'react' }], 'src/a/a.ts', 'typescript')).toEqual({ kind: 'absent', reason: 'outside' });
    expect(told.classifyUse([{ kind: 'path', specifier: 'x.h' }], 'src/a/a.c', 'c')).toEqual({ kind: 'absent' });
  });
});

// A Python name imported from a relative module that is no module itself (`from ..data.m import x`, `from ..data import x`) binds that module's file, as the absolute form (`from pkg.data.m import x`) does.
describe('resolver.classifyUse — a Python name imported from a relative module', () => {
  const contents = new Map([['src/pkg/__init__.py', ''], ['src/pkg/data/__init__.py', ''], ['src/pkg/data/m.py', 'x = 1'], ['src/pkg/ui/__init__.py', ''], ['src/pkg/ui/a.py', '']]);
  const ownerOf = (f) => (contents.has(f) ? f.split('/').at(-2) : undefined);
  const r = makeResolver({ ownerIndex: { ownerOf }, symbolTable: new SymbolTable(), resolvePathToFile: makeResolvePathToFile('/nonexistent', ownerOf, undefined, { files: listedFileView(contents.keys(), (p) => contents.get(p)) }) });
  const use = (specifier) => r.classifyUse([{ kind: 'path', specifier }], 'src/pkg/ui/a.py', 'python');

  it('binds the module or the package\'s __init__.py, the file the absolute form binds', () => {
    expect(use('..data.m.x')).toEqual({ kind: 'resolved', owner: 'data', resolvedFile: 'src/pkg/data/m.py' });
    expect(use('pkg.data.m.x')).toEqual({ kind: 'resolved', owner: 'data', resolvedFile: 'src/pkg/data/m.py' });
    expect(use('..data.x')).toEqual({ kind: 'resolved', owner: 'data', resolvedFile: 'src/pkg/data/__init__.py' });
    expect(use('pkg.data.x')).toEqual({ kind: 'resolved', owner: 'data', resolvedFile: 'src/pkg/data/__init__.py' });
    expect(r.classify({ kind: 'path', specifier: '..data.m.x' }, 'src/pkg/ui/a.py', 'python')).toEqual({ kind: 'resolved', owner: 'data', resolvedFile: 'src/pkg/data/m.py' });
  });
  it('a relative path that binds no file stays unfollowed', () => {
    expect(use('..data.gone.x')).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(use('..gone.x')).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(use('.missing')).toEqual({ kind: 'absent', reason: 'unfollowed' });
  });
});

// A Python package under a source root that only the project's configuration names (`[tool.setuptools.packages.find] where = ["lib"]`, a setup.cfg `package_dir`) has its absolute imports answered from that root.
describe('resolver.classifyUse — a Python source root named by configuration', () => {
  const resolverOf = (files) => {
    const contents = new Map(Object.entries(files));
    const ownerOf = (f) => (f.endsWith('.py') && contents.has(f) ? f.split('/').at(-2) : undefined);
    return makeResolver({ ownerIndex: { ownerOf }, symbolTable: new SymbolTable(), resolvePathToFile: makeResolvePathToFile('/nonexistent', ownerOf, undefined, { files: listedFileView(contents.keys(), (p) => contents.get(p)) }) });
  };
  const layout = (prefix) => ({ [`${prefix}/pkg/__init__.py`]: '', [`${prefix}/pkg/data/__init__.py`]: '', [`${prefix}/pkg/data/d.py`]: 'x = 1', [`${prefix}/pkg/ui/__init__.py`]: '', [`${prefix}/pkg/ui/a.py`]: '' });
  const uses = (r, prefix) => ['pkg.data.d', 'pkg.data.d.x', '..data.d'].map((specifier) => r.classifyUse([{ kind: 'path', specifier }], `${prefix}/pkg/ui/a.py`, 'python'));
  const resolved = (file) => ({ kind: 'resolved', owner: 'data', resolvedFile: file });

  it('a pyproject.toml naming where = ["lib"] and a setup.cfg mapping package_dir to lib resolve the package in lib/', () => {
    const pyproject = resolverOf({ 'pyproject.toml': '[project]\nname = "x"\n\n[tool.setuptools.packages.find]\nwhere = ["lib"]\n', ...layout('lib') });
    expect(uses(pyproject, 'lib')).toEqual([resolved('lib/pkg/data/d.py'), resolved('lib/pkg/data/d.py'), resolved('lib/pkg/data/d.py')]);
    const cfg = resolverOf({ 'setup.cfg': '[metadata]\nname = x\n\n[options]\npackage_dir =\n    = lib\n', ...layout('lib') });
    expect(uses(cfg, 'lib')).toEqual([resolved('lib/pkg/data/d.py'), resolved('lib/pkg/data/d.py'), resolved('lib/pkg/data/d.py')]);
    expect(pyproject.classify({ kind: 'path', specifier: 'pkg.data.d' }, 'lib/pkg/ui/a.py', 'python')).toEqual(resolved('lib/pkg/data/d.py'));
  });
  it('the same tree under src/ answers as it did, and without the key the package in lib/ stays outside', () => {
    const src = resolverOf({ 'pyproject.toml': '[project]\nname = "x"\n', ...layout('src') });
    expect(uses(src, 'src')).toEqual([resolved('src/pkg/data/d.py'), resolved('src/pkg/data/d.py'), resolved('src/pkg/data/d.py')]);
    const plain = resolverOf({ 'pyproject.toml': '[project]\nname = "x"\n', ...layout('lib') });
    expect(uses(plain, 'lib').slice(0, 2)).toEqual([{ kind: 'absent', reason: 'outside' }, { kind: 'absent', reason: 'outside' }]);
  });
});

// A Python module two source roots hold, and a PHP class two PSR-4 directories map, bind no file; `classifyUse` answers them ambiguous with both files, sorted, where `classify` and the edges answer as before.
describe('resolver.classifyUse — a Python module or a PHP class that several roots answer', () => {
  const resolverOf = (files, ownerOf) => {
    const contents = new Map(Object.entries(files));
    return makeResolver({ ownerIndex: { ownerOf }, symbolTable: new SymbolTable(), resolvePathToFile: makeResolvePathToFile('/nonexistent', ownerOf, undefined, { files: listedFileView(contents.keys(), (p) => contents.get(p)) }) });
  };
  const byDir = (f) => (/\.(py|php)$/.test(f) ? f.split('/').at(-2) : undefined);

  it('Python: a module under two project roots', () => {
    const r = resolverOf({ 'b/pyproject.toml': '', 'b/src/shared/__init__.py': '', 'b/src/shared/util.py': '', 'a/pyproject.toml': '', 'a/src/shared/__init__.py': '', 'a/src/shared/util.py': '', 'c/app/main.py': '', 'c/app/solo.py': '' }, byDir);
    const hint = { kind: 'path', specifier: 'shared.util' };
    expect(r.classifyUse([hint], 'c/app/main.py', 'python')).toEqual({ kind: 'ambiguous', candidates: ['a/src/shared/util.py', 'b/src/shared/util.py'] });
    expect(r.classify(hint, 'c/app/main.py', 'python')).toEqual({ kind: 'absent' });
    expect(r.resolve(hint, 'c/app/main.py', 'python')).toBeUndefined();
    // A name of a module two roots hold falls back to the module, ambiguous the same way; a farther reading that binds still answers.
    expect(r.classifyUse([{ kind: 'path', specifier: 'shared.util.run' }], 'c/app/main.py', 'python')).toEqual({ kind: 'ambiguous', candidates: ['a/src/shared/util.py', 'b/src/shared/util.py'] });
    expect(r.classifyUse([hint, { kind: 'path', specifier: '.solo' }], 'c/app/main.py', 'python')).toEqual({ kind: 'resolved', owner: 'app', resolvedFile: 'c/app/solo.py' });
    // An excluded copy leaves one file, which binds as before.
    const excluded = makeResolver({ ownerIndex: { ownerOf: byDir }, symbolTable: new SymbolTable(), resolvePathToFile: makeResolvePathToFile('/nonexistent', byDir, (p) => p.startsWith('b/'), { files: listedFileView(['a/pyproject.toml', 'a/src/shared/__init__.py', 'a/src/shared/util.py', 'b/pyproject.toml', 'b/src/shared/util.py', 'c/app/main.py'], () => '') }) });
    expect(excluded.classifyUse([hint], 'c/app/main.py', 'python')).toEqual({ kind: 'resolved', owner: 'shared', resolvedFile: 'a/src/shared/util.py' });
  });
  it('PHP: a class two PSR-4 directories of one prefix map, in the nearest map and in the repository\'s union', () => {
    const near = resolverOf({ 'composer.json': '{ "autoload": { "psr-4": { "App\\\\": ["src/", "lib/"] } } }', 'src/Pay/G.php': '<?php', 'lib/Pay/G.php': '<?php', 'src/Order/Handler.php': '<?php' }, byDir);
    const hint = { kind: 'path', specifier: 'App\\Pay\\G' };
    expect(near.classifyUse([hint], 'src/Order/Handler.php', 'php')).toEqual({ kind: 'ambiguous', candidates: ['lib/Pay/G.php', 'src/Pay/G.php'] });
    expect(near.classify(hint, 'src/Order/Handler.php', 'php')).toEqual({ kind: 'absent' });
    expect(near.classifyUse([{ kind: 'path', specifier: 'App\\Pay\\Gone' }], 'src/Order/Handler.php', 'php')).toEqual({ kind: 'absent', reason: 'unfollowed' });
    const union = resolverOf({ 'p1/composer.json': '{ "autoload": { "psr-4": { "Lib\\\\": "src/" } } }', 'p1/src/Thing.php': '<?php', 'p2/composer.json': '{ "autoload": { "psr-4": { "Lib\\\\": "src/" } } }', 'p2/src/Thing.php': '<?php', 'app/composer.json': '{ "autoload": { "psr-4": { "App\\\\": "src/" } } }', 'app/src/Use.php': '<?php' }, (f) => f.split('/')[0]);
    expect(union.classifyUse([{ kind: 'path', specifier: 'Lib\\Thing' }], 'app/src/Use.php', 'php')).toEqual({ kind: 'ambiguous', candidates: ['p1/src/Thing.php', 'p2/src/Thing.php'] });
  });
});

// A Go module of the repository that the importing file's go.mod reaches only through `replace` with a relative directory binds there, as the toolchain loads it; a replacement by a version, by a directory outside the repository or by a directory whose go.mod declares another module stays outside.
describe('resolver.classifyUse — a Go module wired with replace', () => {
  const resolverOf = (files) => {
    const contents = new Map(Object.entries(files));
    const ownerOf = (f) => (f.endsWith('.go') && contents.has(f) ? f.split('/').at(-2) : undefined);
    return makeResolver({ ownerIndex: { ownerOf }, symbolTable: new SymbolTable(), resolvePathToFile: makeResolvePathToFile('/nonexistent', ownerOf, undefined, { files: listedFileView(contents.keys(), (p) => contents.get(p)) }) });
  };
  const use = (r, specifier) => r.classifyUse([{ kind: 'path', specifier, isPackage: true }], 'ui/a.go', 'go');
  const data = { 'data/go.mod': 'module example.com/data\n', 'data/d.go': 'package data', 'data/sub/s.go': 'package sub', 'ui/a.go': 'package ui' };

  it('a replace to a sibling directory whose go.mod declares the module resolves into it, with no go.work', () => {
    for (const replace of ['replace example.com/data => ../data', 'replace example.com/data v0.0.0 => "../data/" // local', 'replace (\n\texample.com/data => ../data\n)']) {
      const r = resolverOf({ ...data, 'ui/go.mod': `module example.com/ui\n\nrequire example.com/data v0.0.0\n\n${replace}\n` });
      expect(use(r, 'example.com/data'), replace).toEqual({ kind: 'resolved', owner: 'data', resolvedFile: 'data/d.go' });
      expect(use(r, 'example.com/data/sub'), replace).toEqual({ kind: 'resolved', owner: 'sub', resolvedFile: 'data/sub/s.go' });
      expect(use(r, 'example.com/data/gone'), replace).toEqual({ kind: 'absent', reason: 'unfollowed' });
      expect(r.classify({ kind: 'path', specifier: 'example.com/data', isPackage: true }, 'ui/a.go', 'go')).toEqual({ kind: 'resolved', owner: 'data', resolvedFile: 'data/d.go' });
    }
  });
  it('a replace by a version, by a directory outside the repository, by one with no go.mod or another module stays outside', () => {
    for (const replace of ['replace example.com/data => example.com/fork v1.0.0', 'replace example.com/data => ../../data', 'replace example.com/data => /abs/data', 'replace example.com/data => ../other', 'replace example.com/data => ../plain', 'replace example.com/data => ../data extra']) {
      const r = resolverOf({ ...data, 'other/go.mod': 'module example.com/other\n', 'other/o.go': 'package other', 'plain/p.go': 'package plain', 'ui/go.mod': `module example.com/ui\n\n${replace}\n` });
      expect(use(r, 'example.com/data'), replace).toEqual({ kind: 'absent', reason: 'outside' });
    }
  });
  it('a replace that names the repository root or a module above, in any spelling, keeps the edge the ancestor walk gives', () => {
    const tools = { 'go.mod': 'module golang.org/x/tools\n', 'go/packages/p.go': 'package packages' };
    for (const [dir, file, replace] of [['gopls', 'gopls/main.go', '../'], ['gopls', 'gopls/main.go', '..'], ['x/gopls', 'x/gopls/main.go', '../../'], ['x/gopls', 'x/gopls/main.go', '../..'], ['x/gopls', 'x/gopls/main.go', './../../']]) {
      const r = resolverOf({ ...tools, [`${dir}/go.mod`]: `module golang.org/x/tools/gopls\n\nrequire golang.org/x/tools v0.30.0\n\nreplace golang.org/x/tools => ${replace}\n`, [file]: 'package main' });
      expect(r.classifyUse([{ kind: 'path', specifier: 'golang.org/x/tools/go/packages', isPackage: true }], file, 'go'), replace).toEqual({ kind: 'resolved', owner: 'packages', resolvedFile: 'go/packages/p.go' });
    }
  });
  it('only the importing file\'s own go.mod replaces: a replace in another module\'s go.mod reaches nothing here', () => {
    const r = resolverOf({ ...data, 'ui/go.mod': 'module example.com/ui\n', 'tool/go.mod': 'module example.com/tool\n\nreplace example.com/data => ../data\n', 'tool/t.go': 'package tool' });
    expect(use(r, 'example.com/data')).toEqual({ kind: 'absent', reason: 'outside' });
    expect(r.classifyUse([{ kind: 'path', specifier: 'example.com/data', isPackage: true }], 'tool/t.go', 'go')).toEqual({ kind: 'resolved', owner: 'data', resolvedFile: 'data/d.go' });
  });
});

// Java reads a simple name of java.lang through the implicit on-demand import of java.lang (JLS §7.3), after the file's own package: its use leaves the repository, where a simple name of the package that no file declares was not followed.
describe('resolver.classifyUse — a simple Java name of java.lang leaves the repository', () => {
  it('tells String from a name of the package that binds nothing, and binds the repository\'s own java.lang where it has one', () => {
    const st = new SymbolTable();
    st.declare('java', 'com.a.Order', 'src/a/Order.java');
    const r = makeResolver({ ownerIndex: { ownerOf: (f) => f.split('/').at(-2) }, symbolTable: st, resolvePathToFile: () => undefined });
    const group = (name) => [{ kind: 'symbol', symbolKey: `com.a.${name}`, samePackage: true }, ...(name === 'String' ? [{ kind: 'symbol', symbolKey: 'java.lang.String' }] : [])];
    expect(r.classifyUse(group('String'), 'src/a/Use.java', 'java')).toEqual({ kind: 'absent', reason: 'outside' });
    expect(r.classifyUse(group('Gone'), 'src/a/Use.java', 'java')).toEqual({ kind: 'absent', reason: 'unfollowed' });
    st.declare('java', 'java.lang.String', 'jdk/lang/String.java');
    expect(r.classifyUse(group('String'), 'src/a/Use.java', 'java')).toEqual({ kind: 'resolved', owner: 'lang', resolvedFile: 'jdk/lang/String.java' });
  });
});
