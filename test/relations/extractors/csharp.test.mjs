// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/csharp.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { runExtractor } from '../../helpers/tree-sitter.mjs';
import { csharpExtractor } from '@chrisdudek/runes/relations';
import { csharpUses } from '../../helpers/internal/relations.mjs';
import { withParsedFile } from '../../helpers/tree-sitter.mjs';
import { SymbolTable } from '@chrisdudek/runes/relations';
import { makeResolver } from '@chrisdudek/runes/relations';
import { withParsedFiles } from '../../helpers/tree-sitter.mjs';

const run = (code) => runExtractor(csharpExtractor, 'csharp', '.cs', code);

/** Every symbol key across EVERY candidate of EVERY detected reference. Each C# reference is
 *  now ONE ordered DetectedDep carrying its whole candidate group (nearest binding first,
 *  verbatim/top-level last), so a key may sit at any position in the group. */
const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

/** The ordered symbol-key group for the reference whose group CONTAINS `key` (anywhere). */
const groupContaining = (
  uses,
  key,
) => {
  const dep = uses.find((u) =>
    u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === key),
  );
  return dep?.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : []));
};

/** Resolve a detected reference exactly as `pass.ts` does: walk its ordered candidate group
 *  and take the FIRST candidate that resolves to a unique mapped owner (stop), silence on a
 *  present-but-ambiguous nearer candidate, continue past absent ones. Returns the bound owner
 *  node, or undefined (silence). `dep` is the reference whose group contains `key`. */
const walkResolve = (
  uses,
  key,
  resolver,
  fromFile,
) => {
  const dep = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === key));
  if (dep === undefined) return undefined;
  for (const cand of dep.candidates) {
    const outcome = resolver.classify(cand, fromFile, 'csharp');
    if (outcome.kind === 'resolved') return outcome.owner; // first bind wins, stop
    if (outcome.kind === 'ambiguous') return undefined; // nearer ambiguity silences the group
    // absent → continue
  }
  return undefined;
};

/** Parse one or more C# source strings under chosen repo-rel paths, keeping every Tree alive
 *  for the callback's duration (withParsedFiles guarantees each is deleted afterward). */
function parseAll(
  specs,
  fn,
) {
  return withParsedFiles(
    specs.map((s) => ({ path: s.path, code: s.code, language: 'csharp' })),
    fn,
  );
}

describe('csharp extractor — declarations() produce <Namespace>.<Type> FQN keys', () => {
  it('qualifies every type kind with a FILE-SCOPED namespace (namespace Foo.Bar;)', async () => {
    const { declarations } = await run(
      [
        'namespace Foo.Bar;',
        'public class C { }',
        'public interface IThing { }',
        'public struct S { }',
        'public record Money(decimal A);',
        'public enum E { X }',
        '',
      ].join('\n'),
    );
    const keys = declarations.map((d) => d.symbolKey);
    expect(keys).toContain('Foo.Bar.C');
    expect(keys).toContain('Foo.Bar.IThing');
    expect(keys).toContain('Foo.Bar.S');
    expect(keys).toContain('Foo.Bar.Money');
    expect(keys).toContain('Foo.Bar.E');
  });

  it('qualifies with a BLOCK namespace and concatenates NESTED namespaces', async () => {
    const { declarations } = await run(
      ['namespace Outer {', '  namespace Inner {', '    class C { }', '  }', '}', ''].join('\n'),
    );
    const keys = declarations.map((d) => d.symbolKey);
    expect(keys).toContain('Outer.Inner.C');
  });

  it('uses the BARE type name when the type is at FILE SCOPE (no namespace)', async () => {
    const { declarations } = await run('class Loose { }\n');
    const keys = declarations.map((d) => d.symbolKey);
    expect(keys).toContain('Loose');
    expect(keys.every((k) => !k.startsWith('.'))).toBe(true);
  });

  it('carries a 1-based line number for each declaration', async () => {
    const { declarations } = await run('namespace N;\n\npublic class OnLineThree { }\n');
    const found = declarations.find((d) => d.symbolKey === 'N.OnLineThree');
    expect(found?.line).toBe(3);
  });
});

describe('csharp extractor — declarations() key NESTED types with the reflection `+` separator', () => {
  it('keys a nested type `Outer+Inner` (and deeper `Outer+Obj+Deep`), NOT the bare simple name', async () => {
    const { declarations } = await run(
      [
        'namespace App;',
        'class Outer {',
        '  class Inner { }',
        '  class Obj { class Deep { } }',
        '}',
        '',
      ].join('\n'),
    );
    const keys = declarations.map((d) => d.symbolKey);
    expect(keys).toContain('App.Outer'); // top-level type unchanged
    expect(keys).toContain('App.Outer+Inner'); // nested → `+` reflection FQN
    expect(keys).toContain('App.Outer+Obj'); // nested
    expect(keys).toContain('App.Outer+Obj+Deep'); // doubly nested
    // D-N5: a nested type emits ONLY its `+` key, never also the bare simple name — that
    // removes the collision that would let a nested `Inner` silence a top-level `App.Inner`.
    expect(keys).not.toContain('App.Inner');
    expect(keys).not.toContain('App.Deep');
    expect(keys).not.toContain('App.Obj');
  });

  it('keys a file-scope nested type `Outer+Inner` with no namespace prefix', async () => {
    const { declarations } = await run(['class Outer { class Inner { } }', ''].join('\n'));
    const keys = declarations.map((d) => d.symbolKey);
    expect(keys).toContain('Outer');
    expect(keys).toContain('Outer+Inner');
    expect(keys).not.toContain('Inner');
  });
});

describe('csharp extractor — uses() emits SYMBOL hints (never path hints)', () => {
  it('emits a FULLY-QUALIFIED `new Foo.Bar.Baz()` as the FQN candidate', async () => {
    const { uses } = await run(
      ['class C { void M() { var o = new Foo.Bar.Baz(); } }', ''].join('\n'),
    );
    expect(symbolKeys(uses)).toContain('Foo.Bar.Baz');
    expect(uses.every((u) => u.candidates[0].kind === 'symbol')).toBe(true);
  });

  it('inside a namespace, emits BOTH the enclosing-namespace expansion AND the verbatim form for a multi-segment qualified base type', async () => {
    // `Foo.Bar.Base` written inside `namespace App;` could bind to `App.Foo.Bar.Base`
    // (enclosing-namespace lookup) OR top-level `Foo.Bar.Base`. We emit BOTH candidates;
    // resolveUnique keeps only one if exactly one resolves, and silences if both resolve
    // to different files.
    const { uses } = await run(['namespace App;', 'class C : Foo.Bar.Base { }', ''].join('\n'));
    const keys = symbolKeys(uses);
    expect(keys).toContain('App.Foo.Bar.Base'); // enclosing-namespace expansion
    expect(keys).toContain('Foo.Bar.Base'); // verbatim fallback
  });

  it('emits a FULLY-QUALIFIED field type as the FQN candidate', async () => {
    const { uses } = await run(['class C { Foo.Bar.Dep _d; }', ''].join('\n'));
    expect(symbolKeys(uses)).toContain('Foo.Bar.Dep');
  });

  it('qualifies a BARE base type via the using scope (`using Foo.Bar; ... : Baz`)', async () => {
    const { uses } = await run(['using Foo.Bar;', 'class C : Baz { }', ''].join('\n'));
    // Candidate FQN = <using prefix>.<bare name>.
    expect(symbolKeys(uses)).toContain('Foo.Bar.Baz');
  });

  it('qualifies a BARE `new Baz()` against EVERY using prefix (multiple candidates are safe)', async () => {
    const { uses } = await run(
      ['using Foo.Bar;', 'using Other.Ns;', 'class C { void M() { var x = new Baz(); } }', ''].join('\n'),
    );
    const keys = symbolKeys(uses);
    // Both candidates emitted — resolveUnique keeps only the one that actually resolves.
    expect(keys).toContain('Foo.Bar.Baz');
    expect(keys).toContain('Other.Ns.Baz');
  });

  it('resolves a BARE name through an ALIAS (`using Gw = Foo.Bar.IGateway;`) — alias expansion is the NEAREST candidate', async () => {
    const { uses } = await run(
      ['using Gw = Foo.Bar.IGateway;', 'class C { void M() { var x = new Gw(); } }', ''].join('\n'),
    );
    // The aliased FQN is the dependency and sits FIRST in the ordered group (the alias is a
    // hard local override, nearest binding). The bare alias name `Gw` is only the harmless
    // verbatim last candidate — it resolves to nothing, so the alias FQN is what binds.
    // The use's group is the one carrying the bare alias name `Gw`; the directive has its own one-candidate group (185).
    const group = groupContaining(uses, 'Gw');
    expect(group?.[0]).toBe('Foo.Bar.IGateway');
    expect(group?.[group.length - 1]).toBe('Gw');
  });

  it('`using static X;` records NO namespace prefix — it imports a TYPE\'s members, not a namespace', async () => {
    const { uses } = await run(
      ['using static Foo.Bar.Calc;', 'class C : Baz { }', ''].join('\n'),
    );
    const keys = symbolKeys(uses);
    // No plain namespace prefix recorded → the bare base `Baz` yields NO `Foo.Bar.Baz` candidate.
    // (The static-using TARGET `Foo.Bar.Calc` IS emitted as its own fully-qualified dependency,
    // but it never expands into a sibling-namespace candidate for `Baz`.)
    expect(keys).not.toContain('Foo.Bar.Baz');
    expect(keys.some((k) => k.endsWith('.Baz'))).toBe(false);
  });

  it('does NOT honor `global using` from another file: a bare name with no in-file using stays SILENT at resolution', async () => {
    // No `using` directive and no namespace in THIS file → the only candidate for a bare base
    // type is its verbatim top-level form (`SomeGlobalType`), the harmless last candidate. With
    // no in-graph file declaring that bare top-level type, it resolves to nothing → SILENCE.
    const { uses } = await run(['class C : SomeGlobalType { }', ''].join('\n'));
    expect(symbolKeys(uses)).toEqual(['SomeGlobalType']);
    const st = new SymbolTable(); // empty table — `global using` declared elsewhere is invisible here
    const resolver = makeResolver({
      ownerIndex: { ownerOf: () => 'someNode' },
      symbolTable: st,
      resolvePathToFile: () => undefined,
    });
    expect(resolver.resolve({ kind: 'symbol', symbolKey: 'SomeGlobalType' }, 'src/c/Use.cs', 'csharp')).toBeUndefined();
  });

  it('every hint is a SYMBOL hint (csharp resolves through the SymbolTable, never a path)', async () => {
    const { uses } = await run(
      ['using Foo.Bar;', 'class C : Baz { Foo.Bar.Dep _d; }', ''].join('\n'),
    );
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.every((u) => u.candidates[0].kind === 'symbol')).toBe(true);
  });

  it('honors `global using Foo.Bar;` as a plain namespace prefix for a bare base type', async () => {
    // `global using` declared in THIS file is treated as a namespace import for this
    // file's scope, so a bare base type qualifies via the prefix.
    const { uses } = await run(['global using Foo.Bar;', 'class C : Baz { }', ''].join('\n'));
    expect(symbolKeys(uses)).toContain('Foo.Bar.Baz');
  });

  it('honors `global using Foo.Bar;` as a prefix for a bare `new Baz()` too', async () => {
    const { uses } = await run(
      ['global using Foo.Bar;', 'class C { void M() { var x = new Baz(); } }', ''].join('\n'),
    );
    expect(symbolKeys(uses)).toContain('Foo.Bar.Baz');
  });

  it('resolves a bare name through a `global using Alias = Foo.Bar.IGateway;` alias — alias expansion is NEAREST', async () => {
    const { uses } = await run(
      ['global using Gw = Foo.Bar.IGateway;', 'class C { void M() { var x = new Gw(); } }', ''].join('\n'),
    );
    const group = groupContaining(uses, 'Gw'); // the use's group, not the directive's own one-candidate group (185)
    expect(group?.[0]).toBe('Foo.Bar.IGateway'); // alias expansion is the first/nearest candidate
    expect(group?.[group.length - 1]).toBe('Gw'); // bare alias name only as harmless last
  });

  it('emits a QUALIFIED base type (`: Foo.Bar.Base`) even with NO using directive', async () => {
    // A qualified_name in a base_list is emitted as-is (not via the bare prefix path).
    const { uses } = await run(['class C : Foo.Bar.Base { }', ''].join('\n'));
    expect(symbolKeys(uses)).toContain('Foo.Bar.Base');
  });

  it('a GENERIC base type (`: List<int>`) emits its BASE name like a bare identifier (B5)', async () => {
    // The generic's base name is a type reference of its own; an external container such as
    // `List` simply resolves to no in-graph declaration (fail-to-silence), so the candidates are
    // harmless — only the in-scope readings are ever produced.
    const { uses } = await run(['using Foo.Bar;', 'class C : List<int> { }', ''].join('\n'));
    expect(symbolKeys(uses)).toEqual(['Foo.Bar.List', 'List']);
  });

  it('handles a base_list with MULTIPLE entries (qualified bare base + bare interface)', async () => {
    // Two base entries on one line: a bare base and a generic interface, each qualified by
    // the using prefix (the generic by its base name, B5).
    const { uses } = await run(
      ['using N;', 'class C : MyBase, IFoo<int> { }', ''].join('\n'),
    );
    const keys = symbolKeys(uses);
    expect(keys).toContain('N.MyBase'); // bare base qualified
    expect(keys).toContain('N.IFoo'); // generic base name qualified
  });

  it('does NOT emit the namespace HEADER of a block `namespace Foo.Bar { }` as a use', async () => {
    // The qualified_name `Foo.Bar` is the namespace declaration name, not a dependency.
    const { uses, declarations } = await run(['namespace Foo.Bar { class C { } }', ''].join('\n'));
    expect(symbolKeys(uses)).not.toContain('Foo.Bar');
    expect(symbolKeys(uses)).toHaveLength(0);
    // The type is still declared with the namespace prefix.
    expect(declarations.map((d) => d.symbolKey)).toContain('Foo.Bar.C');
  });

  it('does NOT emit NESTED block namespace headers as uses (namespace A.B { namespace C.D { } })', async () => {
    const { uses, declarations } = await run(
      ['namespace A.B { namespace C.D { class X { } } }', ''].join('\n'),
    );
    expect(symbolKeys(uses)).toHaveLength(0);
    expect(declarations.map((d) => d.symbolKey)).toContain('A.B.C.D.X');
  });

  it('DEDUPES the SAME candidate key WITHIN one reference group (`: Foo.Bar, Foo.Bar`)', async () => {
    // Each base entry is its own reference → its own ordered group. The dedup is now
    // WITHIN a group: a group never lists the same candidate key twice. (Two distinct base
    // entries legitimately produce two groups — each a clean single-candidate `[Foo.Bar]`.)
    const { uses } = await run(['class C : Foo.Bar, Foo.Bar { }', ''].join('\n'));
    for (const u of uses) {
      const keys = u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : []));
      expect(new Set(keys).size).toBe(keys.length); // no duplicate key inside any one group
    }
  });

  it('DEDUPES a duplicate candidate produced by a REPEATED using prefix WITHIN the group', async () => {
    // Two identical `using A;` directives yield the same prefix; the bare base `Baz` would
    // produce `A.Baz` twice in the same ordered group, but within-group dedup collapses it
    // to a single candidate (order preserved).
    const { uses } = await run(['using A;', 'using A;', 'class C : Baz { }', ''].join('\n'));
    const group = groupContaining(uses, 'A.Baz');
    expect(group?.filter((k) => k === 'A.Baz')).toHaveLength(1);
  });

  it('inside a namespace, expands a multi-segment qualified ref against EACH using prefix too', async () => {
    // `new Models.Order()` inside `namespace App;` with `using Domain;` could mean
    // App.Models.Order, Domain.Models.Order, or top-level Models.Order — emit all three.
    const { uses } = await run(
      ['using Domain;', 'namespace App;', 'class C { void M() { var o = new Models.Order(); } }', ''].join('\n'),
    );
    const keys = symbolKeys(uses);
    expect(keys).toContain('App.Models.Order'); // enclosing-namespace expansion
    expect(keys).toContain('Domain.Models.Order'); // using-prefix expansion
    expect(keys).toContain('Models.Order'); // verbatim fallback
  });

  it('inside a namespace with a using, expands a qualified BASE type the same way', async () => {
    const { uses } = await run(
      ['using Domain;', 'namespace App.Sub;', 'class C : Models.Base { }', ''].join('\n'),
    );
    const keys = symbolKeys(uses);
    expect(keys).toContain('App.Sub.Models.Base'); // enclosing block namespace expansion
    expect(keys).toContain('Domain.Models.Base'); // using-prefix expansion
    expect(keys).toContain('Models.Base'); // verbatim fallback
  });

  it('at FILE SCOPE (no namespace, no using), keeps a multi-segment qualified ref VERBATIM only', async () => {
    // No enclosing namespace and no using prefix → `Foo.Bar.Baz` can ONLY mean top-level
    // Foo.Bar.Baz. It is unambiguous, so it stays a verbatim candidate (no expansion noise).
    const { uses } = await run(['class C { void M() { var o = new Foo.Bar.Baz(); } }', ''].join('\n'));
    const keys = symbolKeys(uses);
    expect(keys).toContain('Foo.Bar.Baz');
    // No spurious namespace/using expansion exists to emit.
    expect(keys).toEqual(['Foo.Bar.Baz']);
  });

  it('ORDERED GROUP: nearest expansion FIRST, verbatim LAST — and the verbatim binds when nothing nearer does (recall)', async () => {
    // Inside `namespace App;`, `Models.Order` is ONE ordered group: the enclosing-namespace
    // expansion `App.Models.Order` (nearest) THEN the verbatim `Models.Order` (last). When only
    // the top-level form is declared, the walk skips the absent nearest and binds the verbatim
    // — the real dependency is found, not over-silenced. (This replaces the C5-era false-green
    // assertion that treated an independent verbatim hint as a hit regardless of order.)
    await parseAll(
      [{ path: 'src/c/Use.cs', code: 'namespace App;\nclass C { void M() { var o = new Models.Order(); } }\n' }],
      ([consumer]) => {
        const group = groupContaining(csharpExtractor.uses(consumer), 'Models.Order');
        expect(group).toEqual(['App.Models.Order', 'Models.Order']); // nearest first, verbatim last

        const st = new SymbolTable();
        st.declare('csharp', 'Models.Order', 'src/m/Order.cs'); // ONLY the top-level form exists
        const resolver = makeResolver({
          ownerIndex: { ownerOf: (f) => (f === 'src/m/Order.cs' ? 'm' : undefined) },
          symbolTable: st,
          resolvePathToFile: () => undefined,
        });
        // The nearest expansion is ABSENT (continue); the verbatim then RESOLVES → the binding.
        expect(resolver.classify({ kind: 'symbol', symbolKey: 'App.Models.Order' }, consumer.path, 'csharp')).toEqual({ kind: 'absent' });
        expect(resolver.classify({ kind: 'symbol', symbolKey: 'Models.Order' }, consumer.path, 'csharp')).toEqual({
          kind: 'resolved', owner: 'm', resolvedFile: 'src/m/Order.cs',
        });
      },
    );
  });

  it('DECISIVE FP (extractor/resolver level): a nearer using-relative split binds and the verbatim is NEVER reached', async () => {
    // The decisive false-positive case for this resolution order, at the candidate-walk
    // level. n1 owns
    // `App.Data.Models+Order` (nested) intra-node; n2 owns top-level `Models.Order`. The
    // consumer in `namespace App.Services; using App.Data;` writes `new Models.Order()`.
    // The ordered group [App.Services.Models.Order, App.Data.Models.Order, Models.Order] binds
    // the nearest that resolves — `App.Data.Models.Order` splits at the declared type
    // `App.Data.Models` to `App.Data.Models+Order` → n1 — and STOPS. The verbatim
    // `Models.Order` (which would resolve to n2) is never reached → no n1→n2 edge.
    await parseAll(
      [{ path: 'src/n1/Order.cs', code: 'namespace App.Services;\nusing App.Data;\npublic class C { void M() { var o = new Models.Order(); } }\n' }],
      ([consumer]) => {
        const st = new SymbolTable();
        st.declare('csharp', 'App.Data.Models', 'src/n1/Data.cs'); // the enclosing nested TYPE
        st.declare('csharp', 'App.Data.Models+Order', 'src/n1/Data.cs'); // the nested Order (n1)
        st.declare('csharp', 'Models.Order', 'src/n2/Order.cs'); // top-level Order (n2)
        const resolver = makeResolver({
          ownerIndex: {
            ownerOf: (f) => (f === 'src/n1/Data.cs' ? 'n1' : f === 'src/n2/Order.cs' ? 'n2' : undefined),
          },
          symbolTable: st,
          resolvePathToFile: () => undefined,
        });
        const group = groupContaining(csharpExtractor.uses(consumer), 'Models.Order');
        // The innermost namespace App.Services, then the using below its declaration (one set: the
        // namespace `App.Data` read where the directive stands, App.Services.App.Data, App.App.Data and
        // App.Data), then the outer namespace App, then the verbatim LAST.
        expect(group).toEqual([
          'App.Services.Models.Order',
          'App.Services.App.Data.Models.Order',
          'App.App.Data.Models.Order',
          'App.Data.Models.Order',
          'App.Models.Order',
          'Models.Order',
        ]);
        // Walk the group in order: first resolved wins and stops.
        const outcomes = group.map((k) => resolver.classify({ kind: 'symbol', symbolKey: k }, consumer.path, 'csharp'));
        expect(outcomes[0]).toEqual({ kind: 'absent' }); // App.Services.Models.Order — absent
        expect(outcomes[1]).toEqual({ kind: 'absent' }); // App.Services.App.Data.Models.Order — absent
        expect(outcomes[2]).toEqual({ kind: 'absent' }); // App.App.Data.Models.Order — absent
        // App.Data.Models.Order splits at the declared type App.Data.Models → App.Data.Models+Order → n1.
        expect(outcomes[3]).toEqual({ kind: 'resolved', owner: 'n1', resolvedFile: 'src/n1/Data.cs' }); // binds n1, stop
        // outcomes[5] (verbatim Models.Order → n2) is NEVER reached by the walk, so n2 is never flagged.
        expect(walkResolve(csharpExtractor.uses(consumer), 'Models.Order', resolver, consumer.path)).toBe('n1');
      },
    );
  });
});

describe('csharp SYMBOL-TABLE resolution — the half this language validates', () => {
  it("builds a SymbolTable from two files' declarations() and resolves a third file's qualified use to the right file", async () => {
    await parseAll(
      [
        { path: 'src/a/Gateway.cs', code: 'namespace MyApp.Payments;\npublic class Gateway { }\n' },
        { path: 'src/b/Audit.cs', code: 'namespace MyApp.Audit;\npublic class AuditLog { }\n' },
        { path: 'src/c/Order.cs', code: 'namespace MyApp.Orders;\nclass Order { void M() { var g = new MyApp.Payments.Gateway(); } }\n' },
      ],
      ([fileA, fileB, consumer]) => {
        // Build the shared SymbolTable exactly as pass.ts step 4 does.
        const st = new SymbolTable();
        for (const f of [fileA, fileB]) {
          for (const d of csharpExtractor.declarations(f)) st.declare('csharp', d.symbolKey, f.path);
        }

        // The consumer's qualified `new` resolves to fileA. The group is
        // [MyApp.Orders.MyApp.Payments.Gateway (enclosing-ns, absent), MyApp.Payments.Gateway
        // (verbatim, binds)] — the ordered walk skips the absent nearest and binds the verbatim.
        const uses = csharpExtractor.uses(consumer);
        // Enclosing-ns chain innermost→outermost (MyApp.Orders, MyApp), then the verbatim LAST.
        expect(groupContaining(uses, 'MyApp.Payments.Gateway')).toEqual([
          'MyApp.Orders.MyApp.Payments.Gateway',
          'MyApp.MyApp.Payments.Gateway',
          'MyApp.Payments.Gateway',
        ]);
        expect(st.resolveUnique('csharp', 'MyApp.Payments.Gateway')).toBe('src/a/Gateway.cs');

        // And the full resolver wires symbol → owner node (mirrors resolver.ts + the pass walk).
        const ownerIndex = {
          ownerOf: (f) =>
            f === 'src/a/Gateway.cs' ? 'a' : f === 'src/b/Audit.cs' ? 'b' : undefined,
        };
        const resolver = makeResolver({
          ownerIndex: ownerIndex,
          symbolTable: st,
          resolvePathToFile: () => undefined,
        });
        expect(walkResolve(uses, 'MyApp.Payments.Gateway', resolver, consumer.path)).toBe('a');
      },
    );
  });

  it('BARE name resolves through the using scope to the right file', async () => {
    await parseAll(
      [
        { path: 'src/a/Gateway.cs', code: 'namespace MyApp.Payments;\npublic class Gateway { }\n' },
        {
          path: 'src/c/Order.cs',
          code: 'using MyApp.Payments;\nnamespace MyApp.Orders;\nclass Order { void M() { var g = new Gateway(); } }\n',
        },
      ],
      ([fileA, consumer]) => {
        const st = new SymbolTable();
        for (const d of csharpExtractor.declarations(fileA)) st.declare('csharp', d.symbolKey, fileA.path);

        // The bare `new Gateway()` group puts the using-prefix expansion `MyApp.Payments.Gateway`
        // ahead of the bare-last `Gateway`; the walk binds it to fileA.
        const uses = csharpExtractor.uses(consumer);
        expect(groupContaining(uses, 'MyApp.Payments.Gateway')).toBeDefined();
        expect(st.resolveUnique('csharp', 'MyApp.Payments.Gateway')).toBe('src/a/Gateway.cs');
        const resolver = makeResolver({
          ownerIndex: { ownerOf: (f) => (f === 'src/a/Gateway.cs' ? 'a' : undefined) },
          symbolTable: st,
          resolvePathToFile: () => undefined,
        });
        expect(walkResolve(uses, 'MyApp.Payments.Gateway', resolver, consumer.path)).toBe('a');
      },
    );
  });

  it('AMBIGUITY: two files declaring the SAME FQN → a use of it resolves to undefined (silence, no flag)', async () => {
    await parseAll(
      [
        { path: 'src/x/Thing.cs', code: 'namespace MyApp.Dup;\npublic class Thing { }\n' },
        { path: 'src/y/Thing.cs', code: 'namespace MyApp.Dup;\npublic class Thing { }\n' },
        { path: 'src/z/Use.cs', code: 'namespace MyApp.Z;\nclass Use { void M() { var t = new MyApp.Dup.Thing(); } }\n' },
      ],
      ([fileX, fileY, consumer]) => {
        const st = new SymbolTable();
        for (const f of [fileX, fileY]) {
          for (const d of csharpExtractor.declarations(f)) st.declare('csharp', d.symbolKey, f.path);
        }

        // resolveUnique returns undefined for the ambiguous FQN.
        expect(st.resolveUnique('csharp', 'MyApp.Dup.Thing')).toBeUndefined();

        // Through the ordered walk the use resolves to nothing — the verbatim `MyApp.Dup.Thing`
        // is present-but-ambiguous (2 defs) → the group silences; never a flag.
        const ownerIndex = { ownerOf: (f) => f.split('/')[1] }; // src/<node>/… — the two declaring files are two NODES
        const resolver = makeResolver({
          ownerIndex: ownerIndex,
          symbolTable: st,
          resolvePathToFile: () => undefined,
        });
        const uses = csharpExtractor.uses(consumer);
        expect(resolver.classify({ kind: 'symbol', symbolKey: 'MyApp.Dup.Thing' }, consumer.path, 'csharp')).toEqual({ kind: 'ambiguous' });
        expect(walkResolve(uses, 'MyApp.Dup.Thing', resolver, consumer.path)).toBeUndefined();
      },
    );
  });
});

describe('csharp anti-FALSE-POSITIVE — the silence list (D8 gate)', () => {
  // Each case must resolve to nothing flaggable. We assert at the resolution layer:
  // every emitted hint resolves to undefined (no in-graph owner) given a SymbolTable
  // that knows only the consumer's own/family types.
  const resolveAll = (
    uses,
    st,
    ownerOf,
  ) => {
    const resolver = makeResolver({
      ownerIndex: { ownerOf },
      symbolTable: st,
      resolvePathToFile: () => undefined,
    });
    // Walk each reference's WHOLE ordered group exactly as pass.ts does: the bound owner is
    // the first candidate that resolves (stop), or undefined if a nearer candidate is
    // ambiguous or nothing binds. A silence case must yield undefined for every group.
    return uses.map((u) => {
      for (const cand of u.candidates) {
        const outcome = resolver.classify(cand, 'src/c/Use.cs', 'csharp');
        if (outcome.kind === 'resolved') return outcome.owner;
        if (outcome.kind === 'ambiguous') return undefined;
      }
      return undefined;
    });
  };

  it('DI-container registration emits NO cross-node flag (services.AddScoped<IFoo, Foo>())', async () => {
    const { uses } = await run(
      [
        'using Microsoft.Extensions.DependencyInjection;',
        'class Startup {',
        '  void Configure(IServiceCollection services) {',
        '    services.AddScoped<IFoo, Foo>();',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
    // IFoo / Foo are bare type args → candidates Microsoft.Extensions.DependencyInjection.IFoo etc.
    // None is declared in a symbol table that maps to a node → all undefined.
    const owners = resolveAll(uses, new SymbolTable(), () => undefined);
    expect(owners.every((o) => o === undefined)).toBe(true);
  });

  it('REFLECTION emits NO flag (Type.GetType / Activator.CreateInstance with string names)', async () => {
    const { uses } = await run(
      [
        'using System;',
        'class R {',
        '  void M() {',
        '    var t = Type.GetType("MyApp.Payments.Gateway");',
        '    var o = Activator.CreateInstance(t);',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
    // The FQN is a STRING literal — never a qualified_name node. No symbol hint can
    // resolve to MyApp.Payments.Gateway even if that type is in the table.
    const st = new SymbolTable();
    st.declare('csharp', 'MyApp.Payments.Gateway', 'src/pay/Gateway.cs');
    const owners = resolveAll(uses, st, (f) => (f === 'src/pay/Gateway.cs' ? 'pay' : undefined));
    expect(owners.every((o) => o === undefined)).toBe(true);
  });

  it('EXTENSION METHOD call emits ONLY an extension-method key (order.Validate()), never a type key', async () => {
    const { uses } = await run(
      ['class C { void M(object order) { order.Validate(); } }', ''].join('\n'),
    );
    // The receiver `order` is a parameter (a value), so the call is looked up as an extension
    // method by NAME in the namespaces in scope (m27). Its `()`-suffixed key lives in a string
    // space no type key can reach, and with no in-repo `Validate` extension it resolves to nothing.
    expect(symbolKeys(uses)).toEqual(['Validate()']);
  });

  it('SOURCE-GENERATED / partial type emits NO flag (partial class, no base/new)', async () => {
    const { uses } = await run(['namespace App;', 'partial class Gen { }', ''].join('\n'));
    expect(symbolKeys(uses)).toHaveLength(0);
  });

  it('`using static X;` emits the fully-qualified TARGET as a sole candidate, NO namespace-prefix expansion', async () => {
    const { uses } = await run(
      ['using static MyApp.Math.Calc;', 'class C { void M() { var r = Compute(); } }', ''].join('\n'),
    );
    // The static-using TARGET `MyApp.Math.Calc` IS a real, fully-qualified type dependency: it is
    // emitted as a ONE-candidate group (no enclosing-ns / using-prefix expansion), so it resolves
    // only when MyApp.Math.Calc is in-graph (external here → silence). Crucially the directive adds
    // NO namespace prefix: `Compute()` (a bare invocation) yields no hint, and no sibling
    // `MyApp.Math.<other>` candidate is ever invented.
    const target = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === 'MyApp.Math.Calc'));
    expect(target).toBeDefined();
    expect(target.candidates).toHaveLength(1); // sole verbatim/FQN candidate, no expansion
    // The ONLY `MyApp.Math.*` key is the target itself — never a sibling-namespace expansion.
    expect(symbolKeys(uses).filter((k) => k.startsWith('MyApp.Math'))).toEqual(['MyApp.Math.Calc']);
  });

  it('`global using` from ANOTHER file is invisible: a bare type stays SILENT at resolution', async () => {
    // No using/namespace in this file; the bare base type's only candidate is its verbatim
    // top-level form (`RepositoryBase`, the harmless last candidate). A `global using` declared
    // elsewhere is invisible here, so nothing maps that bare name to a node → SILENCE.
    const { uses } = await run(['class C : RepositoryBase { }', ''].join('\n'));
    expect(symbolKeys(uses)).toEqual(['RepositoryBase']);
    const owners = resolveAll(uses, new SymbolTable(), () => undefined);
    expect(owners.every((o) => o === undefined)).toBe(true);
  });

  it('EXTERNAL/BCL type resolves to NO node (System.* → external, never a violation)', async () => {
    const { uses } = await run(
      ['class C { System.Text.StringBuilder _sb; void M() { var x = new System.Collections.Generic.List<int>(); } }', ''].join('\n'),
    );
    // Candidates like System.Text.StringBuilder are emitted, but the symbol table /
    // owner index never map them to a node → undefined.
    const owners = resolveAll(uses, new SymbolTable(), () => undefined);
    expect(owners.every((o) => o === undefined)).toBe(true);
  });

  it('dependency onto an UNMAPPED type (declared in table, file owned by NO node) → undefined', async () => {
    const { uses } = await run(
      ['class C { void M() { var x = new Foo.Bar.Baz(); } }', ''].join('\n'),
    );
    const st = new SymbolTable();
    st.declare('csharp', 'Foo.Bar.Baz', 'src/unmapped/Baz.cs');
    // ownerOf returns undefined for the unmapped file → resolver yields undefined (D7).
    const owners = resolveAll(uses, st, () => undefined);
    expect(owners.every((o) => o === undefined)).toBe(true);
  });

  it('INTRA-NODE / family reference: resolves to a file, but to the consumer\'s OWN node (no flag at verify layer)', async () => {
    // This case shows the hint DOES resolve — the self/ancestor filtering is the
    // verifier's job (computeBasis), proven by the e2e round-trip. Here we only assert
    // the resolution points to the consumer's own node, which the verifier never flags.
    const { uses } = await run(
      ['namespace App;', 'class C { void M() { var x = new App.Sibling(); } }', ''].join('\n'),
    );
    const st = new SymbolTable();
    st.declare('csharp', 'App.Sibling', 'src/c/Sibling.cs'); // same node as the consumer
    const owners = resolveAll(uses, st, (f) => (f === 'src/c/Sibling.cs' ? 'c' : undefined));
    // It resolves to node 'c' — the consumer's own node — which is never an undeclared
    // cross-node dependency (the verifier's self/family filter handles it).
    expect(owners).toContain('c');
  });
});

describe('csharp NESTED-TYPE resolution + the tri-state / split over-silence guards', () => {
  /** Resolve a reference whose group contains `key`, via the ordered first-unique-match walk. */
  const walk = (
    uses,
    key,
    st,
    ownerOf,
    fromFile,
  ) => {
    const resolver = makeResolver({ ownerIndex: { ownerOf }, symbolTable: st, resolvePathToFile: () => undefined });
    return walkResolve(uses, key, resolver, fromFile);
  };

  it('RECALL: a cross-node use of `Outer.Inner` resolves to the declaring node via the guarded `+`-split', async () => {
    // Declaration side keys the nested type `App.Outer+Inner`. The use writes `Outer.Inner`
    // (here fully qualified `App.Outer.Inner`); the resolver splits at the declared type
    // `App.Outer` → `App.Outer+Inner` and binds the declaring node.
    await parseAll(
      [
        { path: 'src/a/Nested.cs', code: 'namespace App;\nclass Outer { class Inner { } }\n' },
        { path: 'src/c/Use.cs', code: 'namespace Other;\nclass C { void M() { var x = new App.Outer.Inner(); } }\n' },
      ],
      ([decl, consumer]) => {
        const st = new SymbolTable();
        for (const d of csharpExtractor.declarations(decl)) st.declare('csharp', d.symbolKey, decl.path);
        expect(st.has('csharp', 'App.Outer')).toBe(true); // declared TYPE → the split guard fires
        expect(st.resolveUnique('csharp', 'App.Outer+Inner')).toBe('src/a/Nested.cs');
        const owners = csharpExtractor.uses(consumer);
        expect(walk(owners, 'App.Outer.Inner', st, (f) => (f === 'src/a/Nested.cs' ? 'a' : undefined), consumer.path)).toBe('a');
      },
    );
  });

  it('COLLISION HEALED: a nested `App.Outer+Inner` no longer shadows a top-level `App.Inner` (D-N5)', async () => {
    // A nested Inner (node a) and a top-level Inner (node b) of the same simple name. Because
    // the nested type is keyed `App.Outer+Inner` (not `App.Inner`), a use of the TOP-LEVEL
    // `App.Inner` resolves cleanly to node b — the collateral silencing is gone.
    await parseAll(
      [
        { path: 'src/a/Nested.cs', code: 'namespace App;\nclass Outer { class Inner { } }\n' },
        { path: 'src/b/Inner.cs', code: 'namespace App;\nclass Inner { }\n' },
        { path: 'src/c/Use.cs', code: 'namespace Other;\nclass C { void M() { var x = new App.Inner(); } }\n' },
      ],
      ([nested, topLevel, consumer]) => {
        const st = new SymbolTable();
        for (const f of [nested, topLevel]) {
          for (const d of csharpExtractor.declarations(f)) st.declare('csharp', d.symbolKey, f.path);
        }
        expect(st.resolveUnique('csharp', 'App.Inner')).toBe('src/b/Inner.cs'); // exactly one def now
        const owners = csharpExtractor.uses(consumer);
        expect(walk(owners, 'App.Inner', st, (f) => (f === 'src/b/Inner.cs' ? 'b' : undefined), consumer.path)).toBe('b');
      },
    );
  });

  it('GUARD HOLDS: a namespace-`Foo` type-`Bar` use is NOT re-read as nested `Foo+Bar` even if one coincidentally exists', async () => {
    // `Foo` is a NAMESPACE (no `Foo` type declared), so the `Foo.Bar` use is not split at
    // `Foo`. A coincidental nested `Foo+Bar` in another node must NOT be matched → silence,
    // even though `Foo.Bar` (top-level dotted) maps to node x.
    await parseAll(
      [
        { path: 'src/y/Coin.cs', code: 'namespace App;\nclass Foo { class Bar { } }\n' }, // App.Foo+Bar
        { path: 'src/x/Bar.cs', code: 'namespace Foo;\nclass Bar { }\n' }, // Foo.Bar (namespace Foo)
        { path: 'src/c/Use.cs', code: 'namespace Other;\nclass C { void M() { var x = new Foo.Bar(); } }\n' },
      ],
      ([coincidental, real, consumer]) => {
        const st = new SymbolTable();
        for (const f of [coincidental, real]) {
          for (const d of csharpExtractor.declarations(f)) st.declare('csharp', d.symbolKey, f.path);
        }
        // `Foo` is NOT a declared type (only the namespace), so no split of `Foo.Bar` at `Foo`.
        expect(st.has('csharp', 'Foo')).toBe(false);
        const owners = csharpExtractor.uses(consumer);
        // `Foo.Bar` (verbatim) binds the real top-level `Foo.Bar` in node x; the coincidental
        // `App.Foo+Bar` is NEVER produced for this use. So it resolves to x (the legitimate dotted
        // top-level type), NOT ambiguously to y.
        expect(walk(owners, 'Foo.Bar', st, (f) => (f === 'src/x/Bar.cs' ? 'x' : f === 'src/y/Coin.cs' ? 'y' : undefined), consumer.path)).toBe('x');
      },
    );
  });

  it('SPLIT AMBIGUITY SILENCES: two mapped files both declaring `App.Outer+Inner` → silence, not a flag', async () => {
    await parseAll(
      [
        { path: 'src/a/Nested.cs', code: 'namespace App;\nclass Outer { class Inner { } }\n' },
        { path: 'src/b/Nested.cs', code: 'namespace App;\nclass Outer { class Inner { } }\n' },
        { path: 'src/c/Use.cs', code: 'namespace Other;\nclass C { void M() { var x = new App.Outer.Inner(); } }\n' },
      ],
      ([a, b, consumer]) => {
        const st = new SymbolTable();
        for (const f of [a, b]) {
          for (const d of csharpExtractor.declarations(f)) st.declare('csharp', d.symbolKey, f.path);
        }
        const owners = csharpExtractor.uses(consumer);
        // `App.Outer` is declared in two files (defCount 2) — the split guard `has` still fires,
        // but the split key `App.Outer+Inner` maps to two files → ≥2 distinct → ambiguous → silence.
        expect(walk(owners, 'App.Outer.Inner', st, (f) => f.split('/')[1], consumer.path)).toBeUndefined();
      },
    );
  });

  it('USING-LEVEL CS0104: two usings each defining `Widget` → the using tier is AMBIGUOUS → SILENCE (never the foreign verbatim either)', async () => {
    // `using L1; using L2;` both declare `Widget`; a stray top-level `Widget` also exists in
    // node d. The bare base `Widget`'s ordered group is the enclosing-ns level, then the
    // code-point-sorted using prefixes (L1.Widget, L2.Widget), then the verbatim `Widget` LAST.
    // The using-prefix expansions form ONE binding level (a CS0104 set): both L1.Widget and
    // L2.Widget resolve, to DIFFERENT nodes → the simple name is genuinely ambiguous per the C#
    // spec → the whole group SILENCES. It binds NEITHER an arbitrary import NOR the foreign
    // top-level `Widget` in node d. Zero edge, zero false positive.
    await parseAll(
      [
        { path: 'src/a/W.cs', code: 'namespace L1;\nclass Widget { }\n' },
        { path: 'src/b/W.cs', code: 'namespace L2;\nclass Widget { }\n' },
        { path: 'src/d/W.cs', code: 'class Widget { }\n' }, // top-level `Widget` — must NEVER bind
        { path: 'src/c/Use.cs', code: 'using L1;\nusing L2;\nnamespace App;\nclass C : Widget { }\n' },
      ],
      ([l1, l2, verbatim, consumer]) => {
        const st = new SymbolTable();
        for (const f of [l1, l2, verbatim]) {
          for (const d of csharpExtractor.declarations(f)) st.declare('csharp', d.symbolKey, f.path);
        }
        const owners = csharpExtractor.uses(consumer);
        const group = groupContaining(owners, 'Widget');
        // Verbatim LAST; using prefixes code-point sorted ahead of it.
        expect(group).toEqual(['App.Widget', 'L1.Widget', 'L2.Widget', 'Widget']);
        expect(group[group.length - 1]).toBe('Widget');
        const resolver = makeResolver({
          ownerIndex: {
            ownerOf: (f) => (f === 'src/a/W.cs' ? 'a' : f === 'src/b/W.cs' ? 'b' : f === 'src/d/W.cs' ? 'd' : undefined),
          },
          symbolTable: st,
          resolvePathToFile: () => undefined,
        });
        const bound = walkResolve(owners, 'Widget', resolver, consumer.path);
        expect(bound).toBeUndefined(); // CS0104: ambiguous using tier silences the whole group
      },
    );
  });
});

describe('csharp extractor — registry wiring', () => {
  it('declares the csharp language', () => {
    expect(csharpExtractor.languages.has('csharp')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-09-24 audit: member access through a type name (M16), extension-method calls and their
// declaration keys (m27), qualified generics and the C# 14 recovery shapes (B5, m2).
describe('csharp — extension-method declaration keys (m27)', () => {
  it('a classic `this` extension in a top-level static class declares `<ns>.<Name>()`', async () => {
    const { declarations } = await run(
      ['namespace Shop.Infra;', 'public static class DI {', '  public static object AddInfra(this object s) => s;', '  public static void Plain(object s) {}', '}', ''].join('\n'),
    );
    const keys = declarations.map((d) => d.symbolKey);
    expect(keys).toContain('Shop.Infra.AddInfra()');
    expect(keys).not.toContain('Shop.Infra.Plain()'); // no `this` receiver → not an extension
  });
  it('a `this` method in a NON-static, nested, or file-local class declares no extension key', async () => {
    const { declarations } = await run(
      [
        'namespace N;',
        'public class NotStatic { public static void A(this object s) {} }',
        'public static class Outer { public static class Inner { public static void B(this object s) {} } }',
        'file static class Local { public static void C(this object s) {} }',
        '',
      ].join('\n'),
    );
    expect(declarations.map((d) => d.symbolKey).filter((k) => k.endsWith('()'))).toEqual([]);
  });
  it('a C# 14 extension-block member declares a key on the shipped grammar (misread block)', async () => {
    const { declarations } = await run(
      ['namespace N;', 'public static class E { extension(object o) { public int Size() => 0; } }', ''].join('\n'),
    );
    expect(declarations.map((d) => d.symbolKey)).toContain('N.Size()');
  });
});

describe('csharp — member-access receivers and extension calls (M16, m27)', () => {
  const groups = (uses) =>
    uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

  it('a dotted receiver emits ONE group of its prefixes, leftmost first', async () => {
    const { uses } = await run(['class C { void M(object o) { Shop.Core.Guard.NotNull(o); } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Shop', 'Shop.Core', 'Shop.Core.Guard']]);
  });
  it('a receiver inside nameof(…) emits nothing', async () => {
    const { uses } = await run(['class C { string M() => nameof(Guard.NotNull); }', ''].join('\n'));
    expect(uses).toHaveLength(0);
  });
  it('a value receiver emits an extension group, never a type group', async () => {
    const { uses } = await run(['using Shop.Infra;', 'class C { void M(object s) { s.AddInfra(); } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Shop.Infra.AddInfra()', 'AddInfra()']]);
  });
  it('an unshadowed type-name receiver emits no extension group (a static call)', async () => {
    const { uses } = await run(['class C { void M() { Guard.Check(); } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Guard']]);
  });
  it('System.Object members, names the file declares as methods, and base.X() are never extension calls', async () => {
    const { uses } = await run(
      ['class C : B { void Run() {} void M(object s) { s.ToString(); s.Equals(s); s.Run(); base.Go(); } }', ''].join('\n'),
    );
    expect(groups(uses).filter((g) => g.some((k) => k.endsWith('()')))).toEqual([]);
  });
  it('a null-conditional call `s?.AddInfra()` is an extension call too', async () => {
    const { uses } = await run(['class C { void M(object s) { s?.AddInfra(); } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['AddInfra()']]);
  });
  it('a generic receiver `Result<Order>.Ok()` is a type position (base + argument)', async () => {
    const { uses } = await run(['class C { void M() { Result<Order>.Ok(); } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Result'], ['Order']]);
  });
  it('a qualified generic `A.B<C>.D` resolves by its plain dotted name, with its arguments', async () => {
    const { uses } = await run(['class C { A.B<X.Y>.D f; }', ''].join('\n'));
    expect(groups(uses)).toEqual([['A.B.D'], ['X.Y']]);
  });
  it('a closed-generic alias target binds by its plain container name', async () => {
    const { uses } = await run(['using R = Shop.Core.Repository<int>;', 'class C { R r; }', ''].join('\n'));
    expect(groups(uses)[0][0]).toBe('Shop.Core.Repository');
  });
});

describe('csharp — project-wide global alias with 2+ targets (M7)', () => {
  it('silences every reference led by the ambiguous alias; a file-local alias still wins', async () => {
    const code = ['class C { Money m; }', ''].join('\n');
    await withParsedFile('x.cs', code, (tree) => {
      const file = { path: 'x.cs', content: code, tree, language: 'csharp' };
      const ambiguous = csharpUses(file, { projectGlobalUsingAliases: [['Money', 'A.Money'], ['Money', 'B.Money']] });
      expect(ambiguous).toHaveLength(0);
      const single = csharpUses(file, { projectGlobalUsingAliases: [['Money', 'A.Money']] });
      expect(single[0].candidates[0]).toMatchObject({ kind: 'symbol', symbolKey: 'A.Money' });
    });
    const local = ['using Money = L.Money;', 'class C { Money m; }', ''].join('\n');
    await withParsedFile('y.cs', local, (tree) => {
      const file = { path: 'y.cs', content: local, tree, language: 'csharp' };
      const uses = csharpUses(file, { projectGlobalUsingAliases: [['Money', 'A.Money'], ['Money', 'B.Money']] });
      expect(uses[0].candidates[0]).toMatchObject({ kind: 'symbol', symbolKey: 'L.Money' });
    });
  });
});

describe('csharp — extension and receiver shapes that must NOT count (branch guards)', () => {
  const groups = (uses) =>
    uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

  it('only a static top-level class member with a `this` receiver, or a misread extension block member, is an extension', async () => {
    const { declarations } = await run(
      [
        'namespace N;',
        'public interface I { void A(object s); }',
        'public static class S {',
        '  public static void NoParams() {}',
        '  public static void Helper(object s) { void Local() {} }',
        '  static S() { void InCtor() {} }',
        '}',
        '',
      ].join('\n'),
    );
    expect(declarations.map((d) => d.symbolKey).filter((k) => k.endsWith('()'))).toEqual([]);
  });
  it('a generic extension call `s.Get<int>()` is looked up by its base name', async () => {
    const { uses } = await run(['class C { void M(object s) { s.Get<int>(); } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Get()']]);
  });
  it('a plain call `Foo()` and an element-access call are not member calls', async () => {
    const { uses } = await run(['class C { void M(System.Action[] a) { Foo(); a[0](); } }', ''].join('\n'));
    expect(groups(uses).filter((g) => g.some((k) => k.endsWith('()')))).toEqual([]);
  });
  it('a deconstructing foreach declares its names through the pattern', async () => {
    const { uses } = await run(['class C { void M(object xs) { foreach (var (Guard, b) in xs) { Guard.X(); } } }', ''].join('\n'));
    expect(groups(uses).filter((g) => g.includes('Guard'))).toEqual([]);
  });
  it('a lambda parameter shadows a type name', async () => {
    const { uses } = await run(['class C { System.Func<object, object> f = Guard => Guard.ToString(); }', ''].join('\n'));
    expect(groups(uses).filter((g) => g.includes('Guard'))).toEqual([]);
  });
  it('a generic segment ends the receiver chain (`A.B<int>.C()`)', async () => {
    const { uses } = await run(['class C { void M() { A.B<int>.C(); } }', ''].join('\n'));
    expect(groups(uses)).toContainEqual(['A']);
  });
  it('a `global::` qualified generic resolves from the root; a non-global alias-qualified generic emits nothing', async () => {
    const { uses } = await run(['class C { global::A.B<X> f; Lib::A<X>.B g; }', ''].join('\n'));
    const g = groups(uses);
    expect(g).toContainEqual(['A.B']);
    expect(g.flat().some((k) => k.includes('Lib'))).toBe(false);
  });
});

describe('csharp — type arguments of generic methods and the remaining typed expressions (issue 016)', () => {
  const groups = (uses) =>
    uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

  it('a generic method call emits its type arguments, never the method name', async () => {
    const { uses } = await run(['class C { void M(object s) { Make<Order>(); Shop.Make<Line>(); } }', ''].join('\n'));
    const keys = groups(uses).flat();
    expect(keys).toContain('Order');
    expect(keys).toContain('Line');
    expect(keys).not.toContain('Make');
    expect(keys).not.toContain('Shop.Make');
  });
  it('a value-receiver generic call keeps its extension group and adds its type arguments after it', async () => {
    const { uses } = await run(['class C { void M(object sp) { sp.Get<Ctx>(); } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Get()'], ['Ctx']]);
  });
  it('a null-conditional generic call `sp?.Get<Ctx>()` emits its type arguments', async () => {
    const { uses } = await run(['class C { void M(object sp) { sp?.Get<Ctx>(); } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Get()'], ['Ctx']]);
  });
  it('a nested generic type argument `Get<List<Ctx>>()` emits the container and its argument', async () => {
    const { uses } = await run(['class C { void M(object sp) { sp.Get<List<Ctx>>(); } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Get()'], ['List'], ['Ctx']]);
  });
  it('an array creation emits its element type through jagged ranks; `new[] { … }` names none', async () => {
    const { uses } = await run(['class C { object M() { var a = new[] { 1 }; return new Order[2][]; } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Order']]);
  });
  it('a deconstructing foreach emits each typed element; `var` and predefined types emit nothing', async () => {
    const { uses } = await run(['class C { void M(object xs) { foreach ((Order p, int q) in xs) {} foreach (var r in xs) {} } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Order']]);
  });
  it('`out var x` emits nothing; `out Order x` emits Order', async () => {
    const { uses } = await run(['class C { void M(object c) { c.TryGet(out var a); c.TryGet(out Order b); } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['TryGet()'], ['TryGet()'], ['Order']]);
  });
});

describe('csharp — the implicit Program of top-level statements (issue 075)', () => {
  const keys = (declarations) => declarations.map((d) => [d.symbolKey, d.line]);
  const groups = (uses) =>
    uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

  // The implicit class is published under its own fallback key (the compiler's pre-C# 10 name, which no source can write), so an explicit global `Program` anywhere is always tried first.
  it('a file with top-level statements declares the implicit `Program` fallback key at its first statement', async () => {
    const { declarations } = await run(['using System;', '', 'var app = Build(args);', 'app.Run();', ''].join('\n'));
    expect(keys(declarations)).toEqual([['<Program>$', 3]]);
  });
  it('an explicit global `partial class Program` beside the statements is declared once, as `Program`, at the class', async () => {
    const { declarations } = await run(['var app = Build(args);', 'app.Run();', 'public partial class Program { }', ''].join('\n'));
    expect(keys(declarations)).toEqual([['Program', 3]]);
  });
  it('a `Program` inside a namespace is another type: the implicit fallback key is still declared', async () => {
    const { declarations } = await run(['System.Console.WriteLine(1);', 'namespace App { class Program { } }', ''].join('\n'));
    expect(keys(declarations)).toEqual([['App.Program', 2], ['<Program>$', 1]]);
  });
  it('a file without top-level statements declares no implicit `Program`', async () => {
    const { declarations } = await run(['namespace App;', 'public class Startup { void Main() { } }', ''].join('\n'));
    expect(keys(declarations)).toEqual([['App.Startup', 2]]);
  });
  it('a bare `Program` reference tries every explicit reading first and the implicit fallback last', async () => {
    const { uses } = await run(['namespace T;', 'class C { F<Program> f; }', ''].join('\n'));
    expect(groups(uses)).toEqual([['T.F', 'F'], ['T.Program', 'Program', '<Program>$']]);
  });
  it('inside a file of top-level statements, `Program` and `Program.X` name the file\'s own class and emit nothing', async () => {
    const { uses } = await run(['var s = AddUserSecrets<Program>();', 'var t = typeof(Program);', 'Program.Helper();', 'Program.Inner x = null;', 'Order o = null;', ''].join('\n'));
    expect(groups(uses)).toEqual([['Order']]);
  });
  it('any other name, and a qualified `App.Program`, gets no fallback', async () => {
    const { uses } = await run(['class C { Programs a; App.Program b; global::App.Program c; }', ''].join('\n'));
    expect(groups(uses).flat()).not.toContain('<Program>$');
  });
});

describe('csharp — a declaration expression names a type only where C# allows one (issue 016, round 2)', () => {
  const groups = (uses) =>
    uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

  it('a comparison pair in a call, constructor or indexer argument list emits nothing', async () => {
    const { uses } = await run(['class C { object M(int i, int j) => F(i < A, j > B) && new P(i < A, j > B) && this[i < A, j > B]; }', ''].join('\n'));
    expect(groups(uses).flat().filter((k) => ['i', 'A', 'j'].includes(k))).toEqual([]);
  });
  it('a declaration-shaped tuple that is not a deconstruction target emits nothing', async () => {
    const { uses } = await run(['class C { void M() { var t = (Order a, Customer b); t = (Order c, Customer d); } }', ''].join('\n'));
    expect(groups(uses)).toEqual([]);
  });
  it('a nested deconstruction target emits every typed element', async () => {
    const { uses } = await run(['class C { void M() { ((Order a, int b), Customer c) = P(); } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Order'], ['Customer']]);
  });
});

describe('csharp — a type parameter in scope shadows a type of the same name (issue 138)', () => {
  const groups = (uses) =>
    uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

  it('a class type parameter names nothing in a field, a return type, a parameter, a constraint, typeof, a cast, `is`, `as` or `new T[n]`', async () => {
    const { uses } = await run(['class Repo<T> : Base<T> where T : class { T f; T M(T a) => (T)a ?? (a as T) ?? default(T); bool N(object o) => o is T; object K() => typeof(T); T[] P(int n) => new T[n]; }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Base']]);
  });
  it('a method, local function, delegate, interface and record type parameter names nothing, a generic method call\'s type argument included', async () => {
    const { uses } = await run([
      'class C { U Get<U>(object sp) => sp.GetRequiredService<U>(); void L() { V F<V>(V v) => v; } }',
      'delegate R D<R>(R r);',
      'interface I<K> { K Next(); }',
      'record E<B>(B Body);',
      '',
    ].join('\n'));
    expect(groups(uses)).toEqual([['GetRequiredService()']]);
  });
  it('outside its declaration, and in the declaration\'s own attributes, the same name is a type reference', async () => {
    const { uses } = await run(['[A(typeof(T))] class Box<T> { }', 'class S { T M<T>() => default(T); T Current; }', ''].join('\n'));
    expect(groups(uses)).toEqual([['A', 'AAttribute'], ['T'], ['T']]);
  });
  it('a name with type arguments never names a type parameter', async () => {
    const { uses } = await run(['class Repo<Entity> { Entity<int> keyed; }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Entity']]);
  });
});

describe('csharp — a qualified comparison pair the grammar reads as a declaration (issue 150)', () => {
  const groups = (uses) =>
    uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

  it('`x.i < A, j > B` and `a.b.i < A, j.k > B` in a call, constructor or indexer argument list emit nothing', async () => {
    const { uses } = await run(['class C { object M(object x, object a, int j) => F(x.i < A, j > B) && new P(x.i < A, j > B) && this[a.b.i < A, j.k > B]; }', ''].join('\n'));
    expect(groups(uses)).toEqual([['P']]);
  });
  it('a qualified generic `out` declaration and deconstruction element still emit the type and its arguments', async () => {
    const { uses } = await run(['class C { void M(object c) { c.TryGet(out A.B<X, Y> v); (A.B<Z> p, int q) = c.Pair(); } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['TryGet()'], ['A.B'], ['X'], ['Y'], ['A.B'], ['Z'], ['Pair()']]);
  });
});

describe('csharp — the element type of a stackalloc (issue 139)', () => {
  const groups = (uses) =>
    uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

  it('`stackalloc Foo[n]` and `stackalloc Baz[] { … }` emit the element; a predefined element and `stackalloc[] { … }` emit nothing', async () => {
    const { uses } = await run(['class C { unsafe void M(int n) { var s = stackalloc Foo[n]; var u = stackalloc Baz[] { 1 }; var a = stackalloc int[2]; var w = stackalloc[] { 1, 2 }; } }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Foo'], ['Baz']]);
  });
});

describe('csharp — `global::` with a single name binds the global namespace only (issue 156)', () => {
  const groups = (uses) =>
    uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

  it('`global::Settings` and `global::Box<Order>` are rooted: no enclosing namespace or using candidate; the type argument is an ordinary reference', async () => {
    const { uses } = await run(['using Shop.Core;', 'namespace App;', 'class C : global::Base { global::Settings s; global::Box<Order> b; object M() => new global::Thing(); }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Base'], ['Settings'], ['Box'], ['App.Order', 'Shop.Core.Order', 'Order'], ['Thing']]);
  });
  it('`global::Program` falls back to the implicit Program; a type parameter `T` never shadows `global::T`', async () => {
    const { uses } = await run(['namespace App;', 'class C<T> { global::Program p; global::T t; T u; }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Program', '<Program>$'], ['T']]);
  });
  it('inside a file of top-level statements, `global::Program` is the file\'s own class and emits nothing', async () => {
    const { uses } = await run(['var t = typeof(global::Program);', ''].join('\n'));
    expect(groups(uses)).toEqual([]);
  });
});

describe('csharp — a tuple type with named elements as a type argument (issue 161)', () => {
  const groups = (uses) =>
    uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

  it('the element types of a named tuple type argument followed by an initializer, arguments or a pattern designation are emitted; the element names never are', async () => {
    const { uses } = await run([
      'class C { object M(int n, object x) {',
      '  var a = new List<(Order Item, int Index)> { };',
      '  var b = new List<(Customer Who, (Line L, int N) Pair)>(n);',
      '  var c = Make<(Shipment Parcel, int Index)>(n);',
      '  return x is List<(Invoice Doc, int Count)> y;',
      '} }',
      '',
    ].join('\n'));
    expect(groups(uses)).toEqual([['Order'], ['List'], ['Customer'], ['Line'], ['List'], ['Shipment'], ['Invoice']]);
  });
  it('a bare unnamed element beside a named one is a type; a comparison with a plain tuple or a plain operand emits nothing', async () => {
    const { uses } = await run(['class C { object M(int n, int i, int a, int b) => new List<(Foo F, Bar)>(n) ?? (i < (a, b)) ?? (i < a); }', ''].join('\n'));
    expect(groups(uses)).toEqual([['Foo'], ['Bar'], ['List']]);
  });
});

describe('csharp — `global::` in attributes and member accesses, and a named tuple type argument one generic level deeper (issue 174)', () => {
  const groups = (uses) =>
    uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

  it('an attribute written after `global::` is rooted, single or qualified, plain or generic; its type arguments are ordinary references', async () => {
    // `[global::A.Bar]` was read through the enclosing namespaces and the usings, and `[global::Foo]` / `[global::Gen<Order>]` emitted nothing.
    const { uses } = await run(['using Shop.Core;', 'namespace Shop.Web;', '[global::A.Bar, global::Foo]', '[global::Gen<Order>]', '[global::A.BazAttribute(1)]', '[Local]', 'class C { }', ''].join('\n'));
    expect(groups(uses)).toEqual([
      ['A.Bar', 'A.BarAttribute'],
      ['Foo', 'FooAttribute'],
      ['Gen', 'GenAttribute'],
      ['Shop.Web.Order', 'Shop.Order', 'Shop.Core.Order', 'Order'],
      ['A.BazAttribute'],
      ['Shop.Web.Local', 'Shop.Local', 'Shop.Core.Local', 'Local', 'Shop.Web.LocalAttribute', 'Shop.LocalAttribute', 'Shop.Core.LocalAttribute', 'LocalAttribute'],
    ]);
  });

  it('a member reached through `global::` reads its receiver from the root only, and no declared name shadows it', async () => {
    // `global::X.Member()` emitted nothing.
    const { uses } = await run([
      'using Shop.Core;',
      'namespace Shop.Web;',
      'class C {',
      '  int X;',
      '  object M() {',
      '    global::X.Member();',
      '    global::A.B.C.Run(X);',
      '    var v = global::X.Prop;',
      '    var g = global::Box<Order>.Create();',
      '    var n = nameof(global::X.Member);',
      '    return X.Member();',
      '  }',
      '}',
      '',
    ].join('\n'));
    // The last line's `X` is the field, so `X.Member()` is only an extension-method call on a value.
    expect(groups(uses)).toEqual([['X'], ['A', 'A.B', 'A.B.C'], ['X'], ['Box'], ['Shop.Web.Order', 'Shop.Order', 'Shop.Core.Order', 'Order'], ['Shop.Web.Member()', 'Shop.Member()', 'Shop.Core.Member()', 'Member()']]);
  });

  it('a `global::` receiver ignores a project-wide alias that silences the same bare name, and in a file of top-level statements `global::Program` is the file\'s own class', async () => {
    const code = ['class C { void M() { global::Money.Parse(); Money.Parse(); } }', ''].join('\n');
    await withParsedFile('x.cs', code, (tree) => {
      const file = { path: 'x.cs', content: code, tree, language: 'csharp' };
      expect(groups(csharpUses(file, { projectGlobalUsingAliases: [['Money', 'A.Money'], ['Money', 'B.Money']] }))).toEqual([['Money']]);
    });
    const { uses } = await run(['global::Program.Main();', 'global::Other.Run();', ''].join('\n'));
    expect(groups(uses)).toEqual([['Other']]);
  });

  it('a `global::` qualified name is rooted in every position it can take', async () => {
    const { uses } = await run([
      'using Shop.Core;',
      'namespace Shop.Web;',
      'class C : global::A.Bar, global::A.IFace<global::A.Bar> {',
      '  global::A.Bar f;',
      '  object M(object o) {',
      '    var a = typeof(global::A.Bar);',
      '    var c = (global::A.Bar)o;',
      '    var d = new global::A.Bar();',
      '    var e = new global::A.Bar[2];',
      '    var h = default(global::A.Bar);',
      '    var i = Make<global::A.Bar>();',
      '    var l = o as global::A.Bar;',
      '    global::A.Bar.Run();',
      '    return null;',
      '  }',
      '  void N<T>() where T : global::A.Bar { }',
      '}',
      '',
    ].join('\n'));
    const rows = groups(uses);
    expect(rows).toEqual([['A.Bar'], ['A.IFace'], ['A.Bar'], ['A.Bar'], ['A.Bar'], ['A.Bar'], ['A.Bar'], ['A.Bar'], ['A.Bar'], ['A.Bar'], ['A.Bar'], ['A', 'A.Bar'], ['A.Bar']]);
  });

  it('the element types of a named tuple one or two generic levels deeper are emitted, and so are the enclosing generics; the element names and the method name never are', async () => {
    // The closing `>>` / `>>>` is read as a shift around the tuple, so these gave no edge.
    const { uses } = await run([
      'class C { object M(int n, int i, int a, int b) {',
      '  var x = new List<List<(Order Item, int Index)>>(n);',
      '  var y = new List<Page<(Customer Who, Line)>> { };',
      '  var z = Make<List<(Invoice Doc, int I)>>(n);',
      '  var w = new Box<Page<List<(Shipment Parcel, int I)>>>(n);',
      '  var s = new List<List<(int Order, string Customer)>>(n);',
      '  return i < (a, b) >> 1;',
      '} }',
      '',
    ].join('\n'));
    // Per line: the tuple's element types, then the enclosing generics innermost first, then the created type.
    expect(groups(uses)).toEqual([['Order'], ['List'], ['List'], ['Customer'], ['Line'], ['Page'], ['List'], ['Invoice'], ['List'], ['Shipment'], ['List'], ['Page'], ['Box'], ['List'], ['List']]);
  });
});

describe('csharp — a generic attribute behind a qualifier, and an attribute after a using alias (issue 181)', () => {
  const groups = (uses) =>
    uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

  it('a qualified generic attribute is named without its type arguments, rooted after `global::`, and its type arguments are ordinary references', async () => {
    // `[A.Gen<Order>]` looked up `A.Gen<Order>` and `A.Gen<Order>Attribute` and emitted no type argument.
    const { uses } = await run(['using Shop.Core;', 'namespace Shop.Web;', '[A.Gen<Order>]', '[global::A.B.Gen<Order, Item>]', '[S::A.Gen<Item>]', 'class C { }', ''].join('\n'));
    expect(groups(uses)).toEqual([
      ['Shop.Web.A.Gen', 'Shop.A.Gen', 'Shop.Core.A.Gen', 'A.Gen', 'Shop.Web.A.GenAttribute', 'Shop.A.GenAttribute', 'Shop.Core.A.GenAttribute', 'A.GenAttribute'],
      ['Shop.Web.Order', 'Shop.Order', 'Shop.Core.Order', 'Order'],
      ['A.B.Gen', 'A.B.GenAttribute'],
      ['Shop.Web.Order', 'Shop.Order', 'Shop.Core.Order', 'Order'],
      ['Shop.Web.Item', 'Shop.Item', 'Shop.Core.Item', 'Item'],
      // A qualifier through a using alias names nothing, as in a type position; the type argument is still read.
      ['Shop.Web.Item', 'Shop.Item', 'Shop.Core.Item', 'Item'],
    ]);
  });

  it('an attribute after a using alias reads both readings in the aliased namespace from the root, and after an unknown or extern alias nothing', async () => {
    // `[S::Foo]` emitted nothing.
    const { uses } = await run(['using S = Shop.Attrs;', 'namespace Shop.Web;', '[S::Foo, S::BarAttribute]', '[S::Gen<Order>(1)]', '[Lib::Foo]', 'class C { }', ''].join('\n'));
    expect(groups(uses)).toEqual([
      ['Shop.Attrs'], // the directive's own target: a namespace, which binds no type (the alias RHS group, 185)
      ['Shop.Attrs.Foo', 'Shop.Attrs.FooAttribute'],
      ['Shop.Attrs.BarAttribute'],
      ['Shop.Attrs.Gen', 'Shop.Attrs.GenAttribute'],
      ['Shop.Web.Order', 'Shop.Order', 'Order'],
    ]);
  });

  it('a project-wide alias binds an attribute after `S::`, and an alias two projects bind differently silences it', async () => {
    const code = ['namespace Shop.Web;', '[P::Foo]', 'class C { }', ''].join('\n');
    await withParsedFile('x.cs', code, (tree) => {
      const file = { path: 'x.cs', content: code, tree, language: 'csharp' };
      expect(groups(csharpUses(file, { projectGlobalUsingAliases: [['P', 'Shop.Attrs']] }))).toEqual([['Shop.Attrs.Foo', 'Shop.Attrs.FooAttribute']]);
      expect(groups(csharpUses(file, { projectGlobalUsingAliases: [['P', 'A.Attrs'], ['P', 'B.Attrs']] }))).toEqual([]);
    });
  });
});
