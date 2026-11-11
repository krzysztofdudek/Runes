// What the C# extractor records of a type beyond its key (the bases it lists) and what the resolver reads through it.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { withParsedFiles } from '../../helpers/tree-sitter.mjs';
import { csharpExtractor, SymbolTable, makeResolver, resolveDetectedEdges } from '@chrisdudek/runes/relations';
import { baseListKey, decodeWritten, decodeUsings, encodeUsings, writtenReadings, USINGS_KEY, interfaceKey, makeCsharpTypeLookup, attributeReading, csharpUses, extractCsharpRefs, methodsKey, decodeMethods, membersKey, decodeMembers, shapeTakes } from '../../helpers/internal/relations.mjs';

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

/** What the one file of a record reads names with: its `usings` record. */
const usingsOf = (table, file) => decodeUsings(table.valuesOf('csharp', USINGS_KEY).find((u) => u.files.includes(file))?.value ?? '{}');

/** The readings of one record of `typeKey`'s base list, as its first file reads them. */
const readingsOf = (table, typeKey, { value, files }) => writtenReadings(decodeWritten(value), typeKey, false, usingsOf(table, files[0]));

/** The bases recorded for `typeKey`: `[name, first reading's key, files]` each. */
const basesOf = (table, typeKey) => table.valuesOf('csharp', baseListKey(typeKey)).map((record) => [decodeWritten(record.value).name, readingsOf(table, typeKey, record)[0]?.symbolKey, record.files]);

describe('csharp: the base list of a type is recorded with its declarations', () => {
  it('records each base of a class with its readings where the declaration stands', async () => {
    await project({
      'src/web/Handler.cs': 'using App.Core;\nnamespace App.Web;\npublic class Handler : HandlerBase, IHandler { }\n',
    }, ({ table, keys }) => {
      expect(basesOf(table, 'App.Web.Handler')).toEqual([
        ['HandlerBase', 'App.Web.HandlerBase', ['src/web/Handler.cs']],
        ['IHandler', 'App.Web.IHandler', ['src/web/Handler.cs']],
      ]);
      const readings = readingsOf(table, 'App.Web.Handler', table.valuesOf('csharp', baseListKey('App.Web.Handler'))[0]);
      expect(readings.map((r) => r.symbolKey)).toEqual(['App.Web.HandlerBase', 'App.HandlerBase', 'HandlerBase', 'App.Core.HandlerBase']);
      expect(readings.every((r) => r.kind === 'symbol')).toBe(true);
      // Each record is a declared key of the file that holds a position and a name, the file's using directives are declared once, and none is a name of the table.
      expect(keys('src/web/Handler.cs').filter((k) => k.startsWith('base:App.Web.Handler\t')).map((k) => k.split('\t')[1])).toEqual(['58:HandlerBase', '71:IHandler']);
      expect(keys('src/web/Handler.cs').filter((k) => k.startsWith(`${USINGS_KEY}\t`))).toEqual([`${USINGS_KEY}\t{"prefixes":["App.Core"]}`]);
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
      expect(decodeWritten(record.value).name).toBe('InnerBase');
      expect(readingsOf(table, 'App.Outer+Inner', record)[0]).toEqual({ kind: 'symbol', symbolKey: 'App.Outer+InnerBase', within: 'App.Outer' });
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
      expect(basesOf(table, 'App.B')[0].slice(0, 2)).toEqual(['global::Lib.Base', 'Lib.Base']);
      expect(basesOf(table, 'App.C')[0].slice(0, 2)).toEqual(['S::Thing', 'Lib.Core.Thing']);
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
      const [, one, two] = readingsOf(table, 'Use', table.valuesOf('csharp', baseListKey('Use'))[0]);
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
  it('lists the instance methods of each type once, with their reach, and none for a static, explicit or extension method or a file-local type', async () => {
    await project({
      'src/a/Types.cs': [
        'namespace App;',
        'public partial class Order : IOrder {',
        '  public void Save() { }',
        '  public void Save(int retries) { }',
        '  public void Save() { }',
        '  void Hidden() { }',
        '  private protected void Shared() { }',
        '  protected void Derived() { }',
        '  protected internal void Wide() { }',
        '  internal void Inside() { }',
        '  private void Secret() { }',
        '  public static void Create() { }',
        '  void IOrder.Explicit() { }',
        '  void Outer() { void Local() { } }',
        '  public class Line { public void Total() { } void Sum() { } }',
        '}',
        'public interface IOrder { void Explicit(); }',
        'public struct Money { public void Round() { } void Trim() { } }',
        'public class Empty { void OnlyPrivate() { } }',
        'public static class Ext { public static void Extra(this Order o) { } }',
        'file class Local { public void Run() { } }',
      ].join('\n'),
    }, ({ keys }) => {
      const listed = Object.fromEntries(keys('src/a/Types.cs').filter((k) => k.startsWith('methods:')).map((k) => k.slice('methods:'.length).split('\t')));
      expect(listed).toEqual({
        // A private method is listed only in a partial type, whose other parts can call it.
        'App.Order': 'Save:0:0:0 Save:0:1:1 -Hidden:0:0:0 ~Shared:0:0:0 ~Derived:0:0:0 Wide:0:0:0 Inside:0:0:0 -Secret:0:0:0 -Outer:0:0:0',
        'App.Order+Line': 'Total:0:0:0',
        'App.IOrder': 'Explicit:0:0:0',
        'App.Money': 'Round:0:0:0',
      });
      expect(decodeMethods(listed['App.Order']).slice(1, 4)).toEqual([{ name: 'Save', shape: '0:1:1', reach: 'public' }, { name: 'Hidden', shape: '0:0:0', reach: 'private' }, { name: 'Shared', shape: '0:0:0', reach: 'protected' }]);
      expect(methodsKey('App.Order')).toBe('methods:App.Order');
    });
  });

  it('records the shape of each overload, and a call fits a method by its counts', async () => {
    await project({
      'src/a/Types.cs': 'public class Bag {\n  public void Put(int a) { }\n  public void Put<T>(T a, int b = 0) { }\n  public void Put(string format, params object[] rest) { }\n  public void Put(int a, int b, int c) { }\n}\n',
    }, ({ keys, table, resolver }) => {
      expect(keys('src/a/Types.cs').filter((k) => k.startsWith('methods:'))).toEqual(['methods:Bag\tPut:0:1:1 Put:1:1:2 Put:0:1:* Put:0:3:3']);
      for (const [shape, typeArgs, args, fits] of [
        ['0:1:1', 0, 1, true], ['0:1:1', 0, 0, false], ['0:1:1', 0, 2, false], ['0:1:1', 1, 1, false],
        ['1:1:2', 0, 1, true], ['1:1:2', 1, 2, true], ['1:1:2', 2, 1, false], ['1:1:2', 0, 3, false],
        ['0:1:*', 0, 1, true], ['0:1:*', 0, 9, true], ['0:1:*', 0, 0, false],
      ]) expect(shapeTakes(shape, typeArgs, args), `${shape} ${typeArgs} ${args}`).toBe(fits);
      const lookup = makeCsharpTypeLookup(table, (readings, fromFile) => readings.find((hint) => resolver.resolveFile(hint, fromFile, 'csharp') !== undefined)?.symbolKey);
      expect(lookup.hasMethod('Bag', { method: 'Put', args: 4, typeArgs: 0 }, [])).toBe(true); // the params overload
      expect(lookup.hasMethod('Bag', { method: 'Put', args: 0, typeArgs: 0 }, [])).toBe(false);
      expect(lookup.hasMethod('Bag', { method: 'Put', args: 1, typeArgs: 2 }, [])).toBe(false);
      expect(lookup.hasMethod('Bag', { method: 'Take', args: 1, typeArgs: 0 }, ['Bag'])).toBe(false);
    });
  });

  it('keeps the extension call where the instance method of that name cannot take the call', async () => {
    await project({
      'src/core/Config.cs': 'namespace App;\npublic interface IConfig { object Get(string key); }\npublic class Item { public bool Has(int kind, int index) => true; }\n',
      'src/ext/Ext.cs': 'namespace App;\npublic static class Ext {\n  public static T Get<T>(this IConfig c, string key) => default;\n  public static bool Has(this Item i, int kind) => true;\n}\n',
      'src/web/Use.cs': 'namespace App;\npublic class Use {\n  void Run(IConfig config, Item item) {\n    config.Get<int>("a");\n    config.Get("a");\n    item.Has(1);\n    item.Has(1, 2);\n    item?.Has(1);\n  }\n}\n',
    }, ({ edges }) => {
      expect(edges('src/web/Use.cs')).toEqual(['3->core', '4->ext', '6->ext', '8->ext']);
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

  it('reads every written type where one scope declares the receiver name twice, the name of each loop in its own loop, and leaves a type parameter unknown', async () => {
    await project({
      // Two declarations of `x` in one block are not valid C#; the reader still takes both types, because it cannot say which the call means.
      'src/a/Use.cs': 'namespace App;\npublic class Use<T> {\n  void Run(T item) {\n    First x = null; Second x = null; x.A();\n    for (Third y = null;;) { y.B(); }\n    for (Fourth y = null;;) { y.B(); }\n    using (Fifth z = null) { z.C(); }\n    item.D();\n  }\n}\n',
    }, ({ files }) => {
      const ext = extractCsharpRefs(files[0]).refs.filter((r) => r.kind === 'ext').map((r) => [r.name, r.on?.map((d) => d.ref), r.from]);
      expect(ext).toEqual([['A', ['First', 'Second'], ['App.Use`1']], ['B', ['Third'], ['App.Use`1']], ['B', ['Fourth'], ['App.Use`1']], ['C', ['Fifth'], ['App.Use`1']], ['D', undefined, ['App.Use`1']]]);
    });
  });

  it('voids every extension reading where a written receiver type has the method, and answers absent, never ambiguous', async () => {
    await project({
      'src/core/Order.cs': 'namespace App;\npublic partial class Order { void Secret() { } public void Open() { } protected void Guarded() { } }\npublic class Other { }\n',
      'src/ext/Ext.cs': 'namespace App;\npublic static class Ext {\n  public static void Secret(this Other o) { }\n  public static void Open(this Other o) { }\n  public static void Guarded(this Other o) { }\n}\n',
      'src/web/Use.cs': 'namespace App;\npublic class Use {\n  void Run(Order order, Other other, Missing missing) {\n    order.Secret();\n    order.Open();\n    other.Open();\n    missing.Open();\n    order.Guarded();\n  }\n}\n',
      'src/core/Order.Part.cs': 'namespace App;\npublic partial class Order {\n  void Run(Order next) { next.Secret(); }\n}\npublic class Rush : Order {\n  void Go(Order next) { next.Guarded(); next.Secret(); }\n}\n',
    }, ({ files, edges, resolver }) => {
      // A private or a protected method of Order does not take a call from Use; the public one does.
      expect(edges('src/web/Use.cs')).toEqual(['3->core', '4->ext', '6->ext', '7->ext', '8->ext']);
      // Another part of Order reaches its private method; a derived class reaches the protected one and not the private one.
      expect(edges('src/core/Order.Part.cs')).toEqual(['6->ext']);
      const group = csharpUses(files.find((f) => f.path === 'src/web/Use.cs')).find((u) => u.line === 5).candidates;
      expect(group.map((c) => c.symbolKey)).toEqual(['App.Open()', 'Open()']);
      expect(group[0].unless).toBe(group[1].unless);
      expect(group[0].unless.map((c) => [c.kind, c.method, c.args, c.typeArgs, c.from, c.receivers.length])).toEqual([['instance-method', 'Open', 0, 0, ['App.Use'], 1]]);
      for (const c of group) {
        expect(resolver.classify(c, 'src/web/Use.cs', 'csharp')).toEqual({ kind: 'absent' });
        expect(resolver.resolve(c, 'src/web/Use.cs', 'csharp')).toBe(undefined);
        expect(resolver.resolveFile(c, 'src/web/Use.cs', 'csharp')).toBe(undefined);
      }
    });
  });
});

describe('csharp: a member of the enclosing type, from another part or a base class, is no type receiver', () => {
  it('lists the members of a type that are no types, with the written type of a field or a property, and none where no other code can read them', async () => {
    await project({
      'src/a/Types.cs': [
        'namespace App;',
        'public partial class Order(Clock clock) : IOrder {',
        '  public int Total, Count;',
        '  const int Limit = 3;',
        '  protected Settings Settings { get; }',
        '  protected AppSettings Options { get; }',
        '  public event System.Action Changed;',
        '  public event System.Action Custom { add { } remove { } }',
        '  private protected Lib.Bag<int>? Shared;',
        '  public static Order Empty;',
        '  public void Save() { int local = 1; }',
        '  public void Save(int retries) { }',
        '  int IOrder.Explicit => 1;',
        '  public int this[int i] => i;',
        '  public class Line { }',
        '}',
        'public interface IOrder { int Explicit { get; } }',
        'public record Money(decimal Amount) { decimal Rounded => Amount; public Kind Kind { get; } public Lib.Kind? Kind2, Kind; }',
        'public class Plain(int seed) { int _hidden; public T Value<T>() => default; }',
        'public class Generic<T> { public T Item; public S::Thing Aliased; public global::Lib.Root Rooted; }',
        'public struct Point(int x) { public int Y; }',
        'public sealed class Closed { public int Field; }',
        'public static class Helpers { public static int Count; }',
        'public sealed partial class Split { public int Kept; int _own; }',
        'public enum Kind { One }',
        'file class Local { public int Value; }',
      ].join('\n'),
    }, ({ keys }) => {
      const listed = Object.fromEntries(keys('src/a/Types.cs').filter((k) => k.startsWith('members:')).map((k) => k.slice('members:'.length).split('\t')));
      const at = (text) => keys('src/a/Types.cs').join('\n').match(new RegExp(`=(\\d+):${text}`))[1];
      expect(listed).toEqual({
        // A partial class lists its private members and its primary constructor parameter: another part reads them. `Settings Settings` is named as its own type and is not listed.
        'App.Order': `-clock Total Count -Limit Options=${at('AppSettings')}:AppSettings Changed=${at('System.Action')}:System.Action Custom Shared=${at('Lib.Bag`1')}:Lib.Bag\`1 Empty=${at('Order')}:Order Save`,
        'App.IOrder': 'Explicit',
        // A record's primary constructor parameter is its public property; its private member is not listed, the record is not partial.
        'App.Money': `Amount Kind2=${at('Lib.Kind')}:Lib.Kind`,
        'App.Plain': 'Value',
        'App.Generic`1': `Item Aliased=${at('S::Thing')}:S::Thing Rooted=${at('global::Lib.Root')}:global::Lib.Root`,
        // A sealed class, a static class and a struct hand nothing down; a partial one still has other parts.
        'App.Split': 'Kept -_own',
      });
      expect(decodeMembers(listed['App.Order']).slice(0, 2)).toEqual([{ name: 'clock', hidden: true }, { name: 'Total', hidden: false }]);
      expect(decodeMembers('Options=12:AppSettings')).toEqual([{ name: 'Options', hidden: false, type: { at: 12, name: 'AppSettings' } }]);
      expect(membersKey('App.Order')).toBe('members:App.Order');
    });
  });

  it('answers what a simple name is in a type: a member, a nested type found first, or nothing', async () => {
    await project({
      'src/a/Types.cs': [
        'namespace App;',
        'public class Root { protected int Shared; int Hidden; public class Nested { } public class Options { } }',
        'public class Mid : Root, IMark { public int Options; }',
        'public partial class Leaf : Mid { }',
        'public partial class Leaf { int Own; public class Shared { } }',
        'public interface IMark { int Marked { get; } }',
        'public interface IDeep : IMark { }',
      ].join('\n'),
    }, ({ table, resolver }) => {
      const lookup = makeCsharpTypeLookup(table, (readings, fromFile) => readings.find((hint) => resolver.resolveFile(hint, fromFile, 'csharp') !== undefined)?.symbolKey);
      expect(lookup.simpleName('App.Leaf', 'Own')).toBe('member'); // private, of the type itself
      expect(lookup.simpleName('App.Leaf', 'Shared')).toBe('type'); // its own nested type hides the inherited field
      expect(lookup.simpleName('App.Mid', 'Shared')).toBe('member');
      expect(lookup.simpleName('App.Leaf', 'Options')).toBe('member'); // the field of the nearer base hides the nested type of the farther
      expect(lookup.simpleName('App.Leaf', 'Nested')).toBe('type');
      expect(lookup.simpleName('App.Leaf', 'Hidden')).toBe('none'); // private in a base class
      expect(lookup.simpleName('App.Leaf', 'Marked')).toBe('none'); // an interface hands a class nothing
      expect(lookup.simpleName('App.IDeep', 'Marked')).toBe('member');
      expect(lookup.simpleName('App.Leaf', 'Missing')).toBe('none');
    });
  });

  it('keeps the type edge of a receiver unless a type around it has that member, and reads an extension call on such a member', async () => {
    await project({
      'src/core/Base.cs': 'namespace App;\npublic class Bag { }\npublic class Base { protected Bag Items; public class Tools { public static void Run() { } } }\n',
      'src/lib/Statics.cs': 'namespace App;\npublic static class Items { public static void Sort() { } }\npublic static class Tools { public static void Run() { } }\npublic static class Free { public static void Go() { } }\n',
      'src/ext/BagExt.cs': 'namespace App;\npublic static class BagExt { public static void Sort(this Bag b) { } public static void Run(this Bag b) { } public static void Go(this Bag b) { } }\n',
      'src/web/Use.cs': 'namespace App;\npublic class Use : Base {\n  void A() { Items.Sort(); }\n  void B() { Tools.Run(); }\n  void C() { Free.Go(); }\n  class Inner { void D() { Items.Sort(); } }\n}\n',
    }, ({ edges, files, resolver }) => {
      // line 3: the inherited field, so the extension method; line 4: the inherited nested type, a static call; line 5: no member, the static class; line 6: the member of the outer type.
      expect(edges('src/web/Use.cs')).toEqual(['2->core', '3->ext', '4->core', '5->lib', '6->ext']);
      const uses = csharpUses(files.find((f) => f.path === 'src/web/Use.cs'));
      const ext = (line) => uses.find((u) => u.line === line && u.candidates[0].symbolKey.endsWith('()')).candidates;
      expect(ext(6)[0].unless).toEqual([{ kind: 'no-member', types: ['App.Use'], name: 'Items', call: { method: 'Sort', args: 0, typeArgs: 0, from: ['App.Use+Inner', 'App.Use'] } }]);
      // No reading answers ambiguous: an extension reading of a static call is absent, and so is each type reading of a receiver that is a member.
      for (const line of [4, 5]) for (const c of ext(line)) expect(resolver.classify(c, 'src/web/Use.cs', 'csharp')).toEqual({ kind: 'absent' });
      expect(resolver.classify(ext(3)[0], 'src/web/Use.cs', 'csharp').kind).toBe('resolved');
      const receiver = uses.find((u) => u.line === 3 && u.candidates[0].within === 'App.Use').candidates;
      expect(receiver[0]).toEqual({ kind: 'symbol', symbolKey: 'App.Use+Items', within: 'App.Use', unless: [{ kind: 'member', types: ['App.Use'], name: 'Items' }] });
      for (const c of receiver) {
        expect(c.unless).toBe(receiver[0].unless);
        expect(resolver.classify(c, 'src/web/Use.cs', 'csharp')).toEqual({ kind: 'absent' });
        expect(resolver.resolveFile(c, 'src/web/Use.cs', 'csharp')).toBe(undefined);
      }
    });
  });

  it('reads a type position past a member of the same name', async () => {
    await project({
      'src/core/Base.cs': 'namespace App.Core;\npublic class Base { protected int Color; }\n',
      'src/model/Color.cs': 'namespace App;\npublic class Color { }\n',
      'src/web/Use.cs': 'using App.Core;\nnamespace App;\npublic class Use : Base {\n  Color _c;\n}\n',
    }, ({ edges }) => {
      expect(edges('src/web/Use.cs')).toEqual(['3->core', '4->model']);
    });
  });
});

describe('csharp: what the large repositories showed', () => {
  it('reads a member named as its own type as the type, so its enum values keep their edge', async () => {
    await project({
      'src/core/Item.cs': 'namespace App;\npublic class Item { public SourceKind SourceKind { get; set; } }\n',
      'src/model/SourceKind.cs': 'namespace App;\npublic enum SourceKind { Library }\n',
      'src/web/Audio.cs': 'namespace App;\npublic class Audio : Item {\n  bool M() => SourceKind == SourceKind.Library;\n}\n',
    }, ({ edges }) => {
      expect(edges('src/web/Audio.cs')).toEqual(['2->core', '3->model']);
    });
  });

  it('ends an extension call on an inherited property whose written type has the method, and keeps one it has not', async () => {
    await project({
      'src/core/Base.cs': 'namespace App;\npublic interface IStore { object Find(int id); }\npublic class Base { protected IStore Store { get; } protected static IStore Shared; protected int[] Numbers; }\n',
      'src/ext/StoreExt.cs': 'namespace App;\npublic static class StoreExt {\n  public static object Find(this IStore s, string id) => null;\n  public static void Flush(this IStore s) { }\n  public static void Sum(this int[] n) { }\n}\n',
      'src/web/Use.cs': 'namespace App;\npublic class Use : Base {\n  void A() { Store.Find(1); }\n  void B() { Store.Flush(); }\n  void C() { Shared.Find(1); }\n  void D() { Numbers.Sum(); }\n  void E() { Store.Inner.Find(1); }\n}\n',
    }, ({ edges, table, resolver }) => {
      // line 3 and 5: IStore has Find(int), an instance method the call fits; line 4: no Flush there; line 6: no named type; line 7: the receiver is more than the member.
      expect(edges('src/web/Use.cs')).toEqual(['2->core', '4->ext', '6->ext', '7->ext']);
      const lookup = makeCsharpTypeLookup(table, (readings, fromFile) => readings.find((hint) => resolver.resolveFile(hint, fromFile, 'csharp') !== undefined)?.symbolKey);
      expect(lookup.memberTypes('App.Use', 'Store')).toEqual(['App.IStore']);
      expect(lookup.memberTypes('App.Use', 'Numbers')).toEqual([]);
      expect(lookup.memberTypes('App.Use', 'Missing')).toEqual([]);
    });
  });
});

describe('resolver: a nested-only reading outside C#', () => {
  it('still reads the split at a declared type and never the dotted key', () => {
    const table = new SymbolTable();
    table.declare('php', 'A.B', 'src/a/B.php');
    table.declare('php', 'A.B+T', 'src/a/T.php');
    table.declare('php', 'A.C.T', 'src/c/T.php');
    const resolver = makeResolver({ ownerIndex: { ownerOf: (f) => f.split('/').at(-2) }, symbolTable: table, resolvePathToFile: () => undefined });
    expect(resolver.resolveFile({ kind: 'symbol', symbolKey: 'A.B.T', nestedOnly: true }, 'x.php', 'php')).toBe('src/a/T.php');
    expect(resolver.resolveFile({ kind: 'symbol', symbolKey: 'A.C.T', nestedOnly: true }, 'x.php', 'php')).toBe(undefined);
  });
});

describe('csharp: the using directives a record is read with', () => {
  it('keeps what the readings of a name depend on, and reads a name as its own file does', async () => {
    const code = [
      'global using Lib.Everywhere;',
      'using Lib.One;',
      'using static Lib.Tools;',
      'global using static Lib.Shared;',
      'using A = Lib.Two.Thing;',
      'namespace App.Web {',
      '  using Lib.Block;',
      '  using static Lib.BlockTools;',
      '  using B = Lib.Three.Other;',
      '  file class Hidden { }',
      '  public class Use : A { B _b; Thing _t; }',
      '}',
    ].join('\n');
    await project({ 'src/web/Use.cs': code }, ({ table, files }) => {
      const usings = usingsOf(table, 'src/web/Use.cs');
      expect(decodeUsings(encodeUsings(usings))).toEqual(usings);
      expect(usings.fileLocalTypes).toEqual(['App.Web.Hidden']);
      expect(usings.scope.prefixDecls.map((d) => [d.ns, d.body])).toEqual([['Lib.One', []], ['Lib.Block', ['App.Web', 'App']]]);
      expect(usings.scope.globalPrefixes).toEqual(['Lib.Everywhere']);
      expect(usings.scope.staticDecls.map((d) => d.fqn)).toEqual(['Lib.Tools', 'Lib.Shared', 'Lib.BlockTools']);
      expect(usings.scope.globalStatics).toEqual(['Lib.Shared']);
      expect([...usings.scope.aliases]).toEqual([['A', 'Lib.Two.Thing'], ['B', 'Lib.Three.Other']]);
      // The base `A` and the field types `B` and `Thing` read exactly as the references in the file do.
      const uses = csharpUses(files[0]);
      const [baseA, fieldB, fieldThing] = uses.filter((u) => u.line === 11).map((u) => u.candidates);
      const at = (text) => code.indexOf(text);
      expect(writtenReadings({ at: at(': A {') + 2, name: 'A' }, 'App.Web.Use', false, usings)).toEqual(baseA);
      expect(writtenReadings({ at: at('B _b'), name: 'B' }, 'App.Web.Use', true, usings)).toEqual(fieldB);
      expect(writtenReadings({ at: at('Thing _t'), name: 'Thing' }, 'App.Web.Use', true, usings)).toEqual(fieldThing);
      expect(writtenReadings({ at: 0, name: '' }, 'App.Web.Use', false, usings)).toEqual([]);
      expect(decodeUsings('{}').scope.prefixDecls).toEqual([]);
    });
  });
});
