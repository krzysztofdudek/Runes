// What the C# extractor records of a type beyond its key (the bases it lists) and what the resolver reads through it.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { withParsedFiles } from '../../helpers/tree-sitter.mjs';
import { csharpExtractor, SymbolTable, makeResolver, resolveDetectedEdges } from '@chrisdudek/runes/relations';
import { baseListKey, decodeBase, interfaceKey, makeCsharpTypeLookup, attributeReading, csharpUses, extractCsharpRefs, methodKey, privateMethodKey } from '../../helpers/internal/relations.mjs';

/** The pipeline over C# sources given as `{ path: code }`: the symbol table of their declarations, a resolver in which a file's owner is its parent directory, and the cross-owner edges of one file. */
async function project(sources, fn) {
  const specs = Object.entries(sources).map(([path, code]) => ({ path, code, language: 'csharp' }));
  return withParsedFiles(specs, (files) => {
    const table = new SymbolTable();
    const declared = new Map();
    for (const f of files) {
      declared.set(f.path, csharpExtractor.declarations(f));
      for (const d of declared.get(f.path)) table.declare('csharp', d.symbolKey, f.path);
    }
    const ownerOf = (file) => file.split('/').at(-2);
    const resolver = makeResolver({ ownerIndex: { ownerOf }, symbolTable: table, resolvePathToFile: () => undefined });
    const edges = (path) => resolveDetectedEdges(csharpExtractor.uses(files.find((f) => f.path === path)), resolver, path, 'csharp')
      .filter((e) => e.owner !== ownerOf(path)).map((e) => `${e.line}->${e.owner}`);
    return fn({ table, resolver, edges, files, keys: (path) => declared.get(path).map((d) => d.symbolKey) });
  });
}

/** The bases recorded for `typeKey`: `[name, first reading's key, files]` each. */
const basesOf = (table, typeKey) => table.valuesOf('csharp', baseListKey(typeKey)).map(({ value, files }) => {
  const base = decodeBase(value);
  return [base.name, base.readings[0]?.symbolKey, files];
});

describe('csharp: the base list of a type is recorded with its declarations', () => {
  it('records each base of a class with its readings where the declaration stands', async () => {
    await project({
      'src/web/Handler.cs': 'using App.Core;\nnamespace App.Web;\npublic class Handler : HandlerBase, IHandler { }\n',
    }, ({ table, keys }) => {
      expect(basesOf(table, 'App.Web.Handler')).toEqual([
        ['HandlerBase', 'App.Web.HandlerBase', ['src/web/Handler.cs']],
        ['IHandler', 'App.Web.IHandler', ['src/web/Handler.cs']],
      ]);
      const base = decodeBase(table.valuesOf('csharp', baseListKey('App.Web.Handler'))[0].value);
      expect(base.readings.map((r) => r.symbolKey)).toEqual(['App.Web.HandlerBase', 'App.HandlerBase', 'HandlerBase', 'App.Core.HandlerBase']);
      expect(base.readings.every((r) => r.kind === 'symbol')).toBe(true);
      // The record is a declared key of the file, and no name of the table.
      expect(keys('src/web/Handler.cs').filter((k) => k.startsWith('base:App.Web.Handler\t'))).toHaveLength(2);
      expect(table.has('csharp', keys('src/web/Handler.cs').find((k) => k.startsWith('base:')))).toBe(false);
    });
  });

  it('records the bases each part of a partial class lists, under the one key', async () => {
    await project({
      'src/a/Worker.cs': 'namespace App;\npublic partial class Worker : WorkerBase { }\n',
      'src/b/Worker.Run.cs': 'namespace App;\npublic partial class Worker : IRunnable { }\n',
      'src/c/Worker.More.cs': 'namespace App;\npublic partial class Worker { }\n',
    }, ({ table }) => {
      expect(basesOf(table, 'App.Worker')).toEqual([
        ['WorkerBase', 'App.WorkerBase', ['src/a/Worker.cs']],
        ['IRunnable', 'App.IRunnable', ['src/b/Worker.Run.cs']],
      ]);
    });
  });

  it('records the base of a nested class under its nested key, read from inside the type around it', async () => {
    await project({
      'src/a/Outer.cs': 'namespace App;\npublic class Outer {\n  public class Inner : InnerBase { }\n  public class InnerBase { }\n}\n',
    }, ({ table }) => {
      const [record] = table.valuesOf('csharp', baseListKey('App.Outer+Inner'));
      const base = decodeBase(record.value);
      expect(base.name).toBe('InnerBase');
      expect(base.readings[0]).toEqual({ kind: 'symbol', symbolKey: 'App.Outer+InnerBase', within: 'App.Outer' });
      expect(table.valuesOf('csharp', baseListKey('App.Outer'))).toEqual([]);
    });
  });

  it('writes a generic base by its arity, a rooted one from the root, and one behind an alias without a name', async () => {
    await project({
      'src/a/Types.cs': [
        'using S = Lib.Core;',
        'namespace App;',
        'public class A : Repo<Order> { }',
        'public class B : global::Lib.Base { }',
        'public class C : S::Thing { }',
        'public class D : Lib.Core.Thing { }',
        'public record E(int X) : EBase(X);',
        'public struct F : IThing { }',
        'public interface IG : IThing { }',
        'public class H<T> : T { }',
        'public enum Kind : byte { One }',
        'file class Hidden : Lib.Base { }',
        'public class Plain { }',
      ].join('\n'),
    }, ({ table, keys }) => {
      expect(basesOf(table, 'App.A')[0].slice(0, 2)).toEqual(['Repo`1', 'App.Repo`1']);
      expect(basesOf(table, 'App.B')[0].slice(0, 2)).toEqual(['Lib.Base', 'Lib.Base']);
      expect(basesOf(table, 'App.C')[0].slice(0, 2)).toEqual(['', 'Lib.Core.Thing']);
      expect(basesOf(table, 'App.D')[0].slice(0, 2)).toEqual(['Lib.Core.Thing', 'App.Lib.Core.Thing']);
      expect(basesOf(table, 'App.E')[0].slice(0, 2)).toEqual(['EBase', 'App.EBase']);
      expect(basesOf(table, 'App.F')[0].slice(0, 2)).toEqual(['IThing', 'App.IThing']);
      expect(basesOf(table, 'App.IG')[0].slice(0, 2)).toEqual(['IThing', 'App.IThing']);
      // A type parameter is no reference: the base is recorded without a name or a reading.
      expect(basesOf(table, 'App.H`1')).toEqual([['', undefined, ['src/a/Types.cs']]]);
      expect(basesOf(table, 'App.Kind')).toEqual([]);
      expect(basesOf(table, 'App.Hidden')).toEqual([]);
      expect(basesOf(table, 'App.Plain')).toEqual([]);
      expect(keys('src/a/Types.cs')).toContain(interfaceKey('App.IG'));
      expect(keys('src/a/Types.cs')).not.toContain(interfaceKey('App.A'));
    });
  });

  it('keeps a CS0104 set of readings one set through the record', async () => {
    await project({
      'src/a/Use.cs': 'using Lib.One;\nusing Lib.Two;\npublic class Use : Shared { }\n',
    }, ({ table }) => {
      const base = decodeBase(table.valuesOf('csharp', baseListKey('Use'))[0].value);
      const [, one, two] = base.readings;
      expect(one.set.map((m) => m.symbolKey)).toEqual(['Lib.One.Shared', 'Lib.Two.Shared']);
      expect(two.set).toBe(one.set);
    });
  });
});

describe('csharp: what a type inherits through its recorded bases', () => {
  const lookupOver = (table, resolver) => makeCsharpTypeLookup(table, (readings, fromFile) => {
    for (const hint of readings) {
      const file = resolver.resolveFile(hint, fromFile, 'csharp');
      if (file !== undefined) return hint.symbolKey;
    }
    return undefined;
  });

  it('lists the bases the repository declares apart from those it does not', async () => {
    await project({
      'src/a/Base.cs': 'namespace App;\npublic class Base { }\npublic interface IMark { }\n',
      'src/b/Thing.cs': 'namespace App;\npublic class Thing : Base, IMark, System.IDisposable { }\n',
    }, ({ table, resolver }) => {
      const lookup = lookupOver(table, resolver);
      expect(lookup.bases('App.Thing')).toEqual({ inside: ['App.Base', 'App.IMark'], outside: ['System.IDisposable'] });
      expect(lookup.bases('App.Base')).toEqual({ inside: [], outside: [] });
      expect(lookup.bases('App.Thing')).toBe(lookup.bases('App.Thing'));
    });
  });

  it('gives an interface the nested types of its base interfaces, and a class none of an interface', async () => {
    await project({
      'src/a/IRoot.cs': 'namespace App;\npublic interface IRoot { public class Options { } }\npublic interface IMid : IRoot { }\npublic class Impl : IMid { }\n',
    }, ({ table, resolver }) => {
      const lookup = lookupOver(table, resolver);
      expect(lookup.nested('App.IMid', 'Options')).toEqual(['App.IRoot+Options']);
      expect(lookup.nested('App.Impl', 'Options')).toEqual([]);
      expect(lookup.path('App.IMid', ['Options', 'Missing'])).toEqual([]);
    });
  });

  it('ends on a base list that leads back to its own type', async () => {
    await project({
      'src/a/Loop.cs': 'namespace App;\npublic class A : B { }\npublic class B : C { }\npublic class C : A { }\n',
    }, ({ table, resolver }) => {
      expect(lookupOver(table, resolver).nested('App.A', 'Options')).toEqual([]);
    });
  });

  it('reads a nested type through two bases, each name of a dotted reading in what the one before gave', async () => {
    await project({
      'src/core/Root.cs': 'namespace App;\npublic class Root { public class Options { public class Retry { } } }\npublic class Mid : Root { }\n',
      'src/web/Leaf.cs': 'namespace App;\npublic class Leaf : Mid {\n  Options.Retry _r;\n  Leaf.Options _o;\n}\n',
      'src/other/Use.cs': 'using App;\nnamespace Other;\npublic class Use {\n  Leaf.Options.Retry _r;\n}\n',
    }, ({ edges }) => {
      expect(edges('src/web/Leaf.cs')).toEqual(['2->core', '3->core', '4->core']);
      expect(edges('src/other/Use.cs')).toEqual(['4->core']);
    });
  });

  it('follows no base that names two types of the repository', async () => {
    await project({
      'src/one/Shared.cs': 'namespace Lib.One;\npublic class Shared { public class Options { } }\n',
      'src/two/Shared.cs': 'namespace Lib.Two;\npublic class Shared { public class Options { } }\n',
      'src/cfg/Options.cs': 'namespace App;\npublic class Options { }\n',
      'src/web/Use.cs': 'using Lib.One;\nusing Lib.Two;\nnamespace App;\npublic class Use : Shared {\n  Options _o;\n}\n',
    }, ({ edges }) => {
      expect(edges('src/web/Use.cs')).toEqual(['5->cfg']);
    });
  });
});

describe('csharp: an attribute is the reading that binds an attribute class', () => {
  const lookupOver = (table, resolver) => makeCsharpTypeLookup(table, (readings, fromFile) => readings.find((hint) => resolver.resolveFile(hint, fromFile, 'csharp') !== undefined)?.symbolKey);

  it('takes the reading C# takes, from what each reading binds', () => {
    // [written, suffixed, has a suffixed reading] -> the reading taken
    const table = [
      ['yes', undefined, true, 'written'], ['yes', 'no', true, 'written'], ['yes', 'maybe', true, 'written'], ['yes', 'yes', true, undefined],
      ['no', 'yes', true, 'suffixed'], ['maybe', 'yes', true, 'suffixed'], [undefined, 'yes', true, 'suffixed'],
      ['no', 'maybe', true, 'suffixed'], ['maybe', 'maybe', true, 'suffixed'], [undefined, 'maybe', true, 'suffixed'],
      ['no', undefined, true, undefined], ['no', 'no', true, undefined], [undefined, 'no', true, undefined], [undefined, undefined, true, undefined],
      ['maybe', undefined, true, undefined], ['maybe', 'no', true, undefined],
      ['yes', undefined, false, 'written'], ['maybe', undefined, false, 'written'], ['no', undefined, false, undefined], [undefined, undefined, false, undefined],
    ];
    for (const [written, suffixed, hasSuffixed, taken] of table) expect(attributeReading(written, suffixed, hasSuffixed), `${written}/${suffixed}/${hasSuffixed}`).toBe(taken);
  });

  it('says whether a type is an attribute class from its base chain', async () => {
    await project({
      'src/a/Types.cs': [
        'using System;',
        'namespace App;',
        'public class DirectAttribute : Attribute { }',
        'public class QualifiedAttribute : System.Attribute { }',
        'public class RootedAttribute : global::System.Attribute { }',
        'public class DerivedAttribute : DirectAttribute, IMark { }',
        'public class Plain { }',
        'public class PlainChild : Plain, IMark { }',
        'public class Outside : Vendor.EntityBase { }',
        'public class OutsideChild : Outside { }',
        'public class Disposable : IDisposable { }',
        'public interface IMark : IDisposable { }',
        'public struct Value { }',
        'public enum Kind { One }',
        'public class LoopA : LoopB { }',
        'public class LoopB : LoopA { }',
        'public partial class Split { }',
        'public partial class Split : Attribute { }',
      ].join('\n'),
    }, ({ table, resolver }) => {
      const lookup = lookupOver(table, resolver);
      const state = (name) => lookup.attributeClass(`App.${name}`);
      for (const name of ['DirectAttribute', 'QualifiedAttribute', 'RootedAttribute', 'DerivedAttribute', 'Split']) expect(state(name), name).toBe('yes');
      for (const name of ['Plain', 'PlainChild', 'IMark', 'Value', 'Kind', 'LoopA', 'LoopB', 'Missing']) expect(state(name), name).toBe('no');
      for (const name of ['Outside', 'OutsideChild', 'Disposable']) expect(state(name), name).toBe('maybe');
      expect(state('DirectAttribute')).toBe('yes'); // read once, answered again
    });
  });

  it('carries the two readings apart in one candidate, and after a using alias too', async () => {
    await project({
      'src/attrs/Marks.cs': 'namespace Lib.Attrs;\npublic class MarkAttribute : System.Attribute { }\npublic class Mark { }\n',
      'src/web/Use.cs': 'using S = Lib.Attrs;\nusing Lib.Attrs;\npublic class Use {\n  [Mark] void A() { }\n  [S::Mark] void B() { }\n  [MarkAttribute] void C() { }\n  [S::Missing] void D() { }\n}\n',
    }, ({ files, edges }) => {
      const uses = csharpUses(files.find((f) => f.path === 'src/web/Use.cs'));
      const attributes = uses.filter((u) => u.candidates[0].attribute !== undefined).map((u) => u.candidates);
      expect(attributes.map((c) => c.length)).toEqual([1, 1, 1, 1]);
      expect(attributes.map(([c]) => [c.symbolKey, c.attribute.written.map((r) => r.symbolKey), c.attribute.suffixed?.map((r) => r.symbolKey)])).toEqual([
        ['Mark', ['Use+Mark', 'Mark', 'Lib.Attrs.Mark'], ['Use+MarkAttribute', 'MarkAttribute', 'Lib.Attrs.MarkAttribute']],
        ['Mark', ['Lib.Attrs.Mark'], ['Lib.Attrs.MarkAttribute']],
        ['MarkAttribute', ['Use+MarkAttribute', 'MarkAttribute', 'Lib.Attrs.MarkAttribute'], undefined],
        ['Missing', ['Lib.Attrs.Missing'], ['Lib.Attrs.MissingAttribute']],
      ]);
      expect(edges('src/web/Use.cs')).toEqual(['4->attrs', '5->attrs', '6->attrs']);
    });
  });

  it('keeps the readings one ordered group where one of them ends at a type the file keeps to itself', async () => {
    await project({
      'src/attrs/Mark.cs': 'namespace Lib;\npublic class Mark : System.Attribute { }\n',
      'src/web/Use.cs': 'using S = Lib;\nnamespace Lib;\nfile class MarkAttribute : System.Attribute { }\npublic class Use {\n  [Mark] void A() { }\n  [S::Mark] void B() { }\n}\n',
    }, ({ files }) => {
      const uses = csharpUses(files.find((f) => f.path === 'src/web/Use.cs'));
      const groups = uses.filter((u) => u.line === 5 || u.line === 6).map((u) => u.candidates.map((c) => [c.symbolKey, c.attribute]));
      expect(groups).toEqual([
        [['Lib.Use+Mark', undefined], ['Lib.Mark', undefined], ['Mark', undefined], ['Lib.Use+MarkAttribute', undefined]],
        [['Lib.Mark', undefined]],
      ]);
    });
  });
});

describe('csharp: an extension call gives way to an instance method of the receiver', () => {
  it('declares each instance method once, a private one apart, and none for a static, explicit or extension method or a file-local type', async () => {
    await project({
      'src/a/Types.cs': [
        'namespace App;',
        'public class Order : IOrder {',
        '  public void Save() { }',
        '  public void Save(int retries) { }',
        '  void Hidden() { }',
        '  private protected void Shared() { }',
        '  internal void Inside() { }',
        '  private void Secret() { }',
        '  public static void Create() { }',
        '  void IOrder.Explicit() { }',
        '  void Outer() { void Local() { } }',
        '  public class Line { public void Total() { } }',
        '}',
        'public interface IOrder { void Explicit(); }',
        'public struct Money { public void Round() { } void Trim() { } }',
        'public static class Ext { public static void Extra(this Order o) { } }',
        'file class Local { public void Run() { } }',
      ].join('\n'),
    }, ({ keys }) => {
      const declared = keys('src/a/Types.cs').filter((k) => k.includes('method:'));
      expect(declared).toEqual([
        methodKey('App.Order', 'Save'), privateMethodKey('App.Order', 'Hidden'), methodKey('App.Order', 'Shared'), methodKey('App.Order', 'Inside'), privateMethodKey('App.Order', 'Secret'),
        privateMethodKey('App.Order', 'Outer'), methodKey('App.Order+Line', 'Total'), methodKey('App.IOrder', 'Explicit'), methodKey('App.Money', 'Round'), privateMethodKey('App.Money', 'Trim'),
      ]);
    });
  });

  it('writes the receiver type the file declares on the call, and none where no type is written', async () => {
    await project({
      'src/a/Use.cs': [
        'namespace App;',
        'public class Use(Primary primary) {',
        '  private readonly Field _field;',
        '  public Prop Prop { get; set; }',
        '  private Generic<int>? _generic;',
        '  private S::Aliased _aliased;',
        '  private int[] _numbers;',
        '  public void Run(Param param, T generic) {',
        '    Local local = null; var inferred = Make();',
        '    param.A(); _field.B(); Prop.C(); local.D(); _generic.E(); primary.F(); this.G(); this._field.H(); _aliased.I();',
        '    inferred.J(); Make().K(); _numbers.L(); param.Inner.M(); this.Run2().N(); this.missing.O();',
        '    foreach (Item item in Items()) item.P();',
        '    foreach (var each in Items()) each.Q();',
        '    System.Func<Param, int> f = p => p.R();',
        '    if (param is Param typed) typed.S();',
        '    try { } catch (Error error) { error.T(); }',
        '    { Local shadow = null; shadow.U(); } { Other shadow = null; shadow.V(); }',
        '    { var param2 = 1; Local twice = null; Other twice2 = null; }',
        '  }',
        '  void Same() { Local x = null, y = null; x.W(); }',
        '  void Lambda() { System.Action<Param> a = (Param q) => q.X(); }',
        '}',
      ].join('\n'),
    }, ({ files }) => {
      const ext = new Map(extractCsharpRefs(files[0]).refs.filter((r) => r.kind === 'ext').map((r) => [r.name, [r.on?.map((d) => d.kind === 'plain' ? d.ref : `${d.aliasName}::${d.tail}`), r.self]]));
      expect(Object.fromEntries(ext)).toEqual({
        A: [['Param'], undefined], B: [['Field'], undefined], C: [['Prop'], undefined], D: [['Local'], undefined], E: [['Generic`1'], undefined], F: [['Primary'], undefined],
        G: [undefined, 'App.Use'], Run2: [undefined, 'App.Use'], H: [['Field'], undefined], I: [['S::Aliased'], undefined],
        J: [undefined, undefined], K: [undefined, undefined], L: [undefined, undefined], M: [undefined, undefined], N: [undefined, undefined], O: [undefined, undefined],
        P: [['Item'], undefined], Q: [undefined, undefined], R: [undefined, undefined], S: [undefined, undefined], T: [undefined, undefined],
        U: [['Local'], undefined], V: [['Other'], undefined], W: [['Local'], undefined], X: [['Param'], undefined],
      });
    });
  });

  it('reads every written type where one scope declares the receiver name twice, and leaves a type parameter unknown', async () => {
    await project({
      'src/a/Use.cs': 'namespace App;\npublic class Use<T> {\n  void Run(T item) {\n    if (true) { } \n    for (First x = null;;) { x.A(); }\n    for (Second x = null;;) { x.A(); }\n    item.B();\n  }\n}\n',
    }, ({ files }) => {
      const ext = extractCsharpRefs(files[0]).refs.filter((r) => r.kind === 'ext').map((r) => [r.name, r.on?.map((d) => d.ref)]);
      expect(ext).toEqual([['A', ['First', 'Second']], ['A', ['First', 'Second']], ['B', undefined]]);
    });
  });

  it('ends the group only where a written receiver type has the method, and a private one counts for `this` alone', async () => {
    await project({
      'src/core/Order.cs': 'namespace App;\npublic class Order { void Secret() { } public void Open() { } }\npublic class Other { }\n',
      'src/ext/Ext.cs': 'namespace App;\npublic static class Ext {\n  public static void Secret(this Other o) { }\n  public static void Open(this Other o) { }\n}\n',
      'src/web/Use.cs': 'namespace App;\npublic class Use {\n  void Run(Order order, Other other, Missing missing) {\n    order.Secret();\n    order.Open();\n    other.Open();\n    missing.Open();\n  }\n}\n',
    }, ({ files, edges, resolver }) => {
      expect(edges('src/web/Use.cs')).toEqual(['3->core', '4->ext', '6->ext', '7->ext']);
      const guard = csharpUses(files.find((f) => f.path === 'src/web/Use.cs')).find((u) => u.line === 5).candidates[0];
      expect(guard.symbolKey).toBe('instance#Open()');
      expect(resolver.classify(guard, 'src/web/Use.cs', 'csharp')).toEqual({ kind: 'ambiguous' });
      expect(resolver.resolve(guard, 'src/web/Use.cs', 'csharp')).toBe(undefined);
      expect(resolver.resolveFile(guard, 'src/web/Use.cs', 'csharp')).toBe(undefined);
    });
  });
});
