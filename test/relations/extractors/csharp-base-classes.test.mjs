// What the C# extractor records of a type beyond its key (the bases it lists) and what the resolver reads through it.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { withParsedFiles } from '../../helpers/tree-sitter.mjs';
import { csharpExtractor, SymbolTable, makeResolver, resolveDetectedEdges } from '@chrisdudek/runes/relations';
import { baseListKey, decodeBase, interfaceKey, makeCsharpTypeLookup } from '../../helpers/internal/relations.mjs';

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
    return fn({ table, resolver, edges, keys: (path) => declared.get(path).map((d) => d.symbolKey) });
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
