// Moved from Yggdrasil source/cli/tests/unit/relations/resolver.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../helpers/expect.mjs';
import { makeResolver } from '@chrisdudek/runes/relations';
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
