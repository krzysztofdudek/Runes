// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/csharp-branch-coverage.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { runExtractor } from '../../helpers/tree-sitter.mjs';
import { csharpExtractor } from '@chrisdudek/runes/relations';

/**
 * Branch-coverage tests for the C# extractor targeting the advanced type-reference
 * forms the primary suite does not exercise: attribute usages (`[Foo]` two-reading
 * group, generic `[Foo<Bar>]`), tuple element types, `global::`-rooted and namespace-
 * alias (`S::Tail`) inline references, C#12 alias-RHS embedded types inside tuple/array
 * wrappers, `is`-constant-pattern type references, and block-namespace name skipping.
 * Each test asserts the concrete symbol candidate the extractor emits.
 */

const run = (code) => runExtractor(csharpExtractor, 'csharp', '.cs', code);

/** Every symbol key across every candidate of every detected reference. */
const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

/** The ordered candidate keys of the FIRST detected reference whose group contains `key`. */
const groupContaining = (uses, key) => {
  const dep = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === key));
  return dep?.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : []));
};

describe('csharp extractor — attribute usages emit a two-reading group', () => {
  it('emits BOTH the verbatim and the `Attribute`-suffixed reading for `[Foo]`', async () => {
    const { uses } = await run('namespace App;\n[Route]\nclass Handler {}\n');
    const keys = symbolKeys(uses);
    // The C# convention: `[Route]` may name `Route` OR `RouteAttribute`.
    expect(keys).toContain('Route');
    expect(keys).toContain('RouteAttribute');
    // Both readings live in ONE ordered group (an attribute is a single dependency).
    const group = groupContaining(uses, 'Route');
    expect(group).toContain('Route');
    expect(group).toContain('RouteAttribute');
  });

  it('does NOT double-suffix an already-`Attribute`-suffixed name `[FooAttribute]`', async () => {
    const { uses } = await run('namespace App;\n[RouteAttribute]\nclass Handler {}\n');
    const keys = symbolKeys(uses);
    expect(keys).toContain('RouteAttribute');
    // No `RouteAttributeAttribute` — the suffixed reading is suppressed when already suffixed.
    expect(keys).not.toContain('RouteAttributeAttribute');
  });

  it('reads a generic attribute `[Foo<Bar>]` as the base name plus each type argument', async () => {
    const { uses } = await run('namespace App;\n[Validate<Models.Customer>]\nclass Handler {}\n');
    const keys = symbolKeys(uses);
    // Base container name resolves the attribute class (verbatim + suffixed reading), with the arity of its type arguments.
    expect(keys).toContain('Validate`1');
    expect(keys).toContain('ValidateAttribute`1');
    // Each generic type ARGUMENT is its own real type reference.
    expect(keys).toContain('Models.Customer');
  });
});

describe('csharp extractor — tuple element types are real references', () => {
  it('emits each NAMED element type of a tuple field type', async () => {
    const { uses } = await run(
      'namespace App;\nclass C {\n  (int, Models.Customer) Pair;\n}\n',
    );
    const keys = symbolKeys(uses);
    // `int` is a predefined type (no dep); the named element is a dependency.
    expect(keys).toContain('Models.Customer');
  });
});

describe('csharp extractor — global:: and namespace-alias inline references', () => {
  it('resolves a `global::A.B.C` reference from the root as its sole candidate', async () => {
    const { uses } = await run('namespace App;\nclass C {\n  global::Other.Models.User U;\n}\n');
    const keys = symbolKeys(uses);
    // The `global::` qualifier is stripped; the clean FQN is the reference.
    expect(keys).toContain('Other.Models.User');
    // A rooted reference resolves verbatim only — no enclosing-ns/using expansion candidates.
    const group = groupContaining(uses, 'Other.Models.User');
    expect(group).toEqual(['Other.Models.User']);
  });

  it('rewrites a `using`-alias-qualified `S::Tail` reference to the aliased FQN', async () => {
    const { uses } = await run(
      'using S = App.Space;\nnamespace App;\nclass C {\n  S::Widget W;\n}\n',
    );
    const keys = symbolKeys(uses);
    // `S::Widget` with `using S = App.Space;` rewrites to `App.Space.Widget`, resolved from root.
    expect(keys).toContain('App.Space.Widget');
  });

  it('emits no key for a non-global `::`-qualified reference that no using alias binds (R13 silence)', async () => {
    const { uses } = await run('namespace App;\nclass C {\n  Lib::Space.Widget W;\n}\n');
    const keys = symbolKeys(uses);
    // With no `using Lib = ...;` the alias descriptor is dropped on assembly, so no key is emitted: the `::` text never reaches a dot-only declaration key (R13), and it is not rewritten into one such as `Space.Widget`.
    expect(keys).not.toContain('Lib::Space.Widget');
    expect(keys).not.toContain('Space.Widget');
  });
});

describe('csharp extractor — C#12 alias-RHS embedded named types', () => {
  it('harvests a named type embedded in an alias RHS TUPLE', async () => {
    const { uses } = await run('using P = (int, App.Models.Order);\nclass C {}\n');
    const keys = symbolKeys(uses);
    expect(keys).toContain('App.Models.Order');
  });

  it('harvests a named type embedded in an alias RHS ARRAY', async () => {
    const { uses } = await run('using A = App.Models.Row[];\nclass C {}\n');
    const keys = symbolKeys(uses);
    expect(keys).toContain('App.Models.Row');
  });
});

describe('csharp extractor — is-pattern constant type reference', () => {
  it('emits the bare type named in an `o is Zed` constant pattern', async () => {
    const { uses } = await run(
      'namespace App;\nclass C {\n  bool M(object o) => o is Widget;\n}\n',
    );
    const keys = symbolKeys(uses);
    expect(keys).toContain('Widget');
  });
});

describe('csharp extractor — block namespace declaration', () => {
  it('qualifies types by a BLOCK namespace and does not treat the namespace name as a use', async () => {
    const { declarations, uses } = await run(
      'namespace App.Services {\n  class Handler {\n    Models.Customer C;\n  }\n}\n',
    );
    // The declared type is namespace-qualified from the block namespace.
    expect(declarations.map((d) => d.symbolKey)).toContain('App.Services.Handler');
    // The namespace NAME `App.Services` is not emitted as a dependency; the field type is.
    const keys = symbolKeys(uses);
    expect(keys).not.toContain('App.Services');
    expect(keys.some((k) => k.endsWith('Models.Customer'))).toBe(true);
  });
});

describe('csharp extractor — a using static imports nested types and extension methods at the level of its directive', () => {
  const groupOf = (uses, key) => uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === key));

  it('the compilation unit reads the nested type of the target after the global namespace, as a nested type only', async () => {
    const { uses } = await run('using static App.Core.Shapes;\nnamespace App.Web;\nclass Draw { Circle c; }\n');
    const group = groupOf(uses, 'App.Core.Shapes.Circle');
    const keys = group.candidates.map((c) => c.symbolKey);
    expect(keys).toEqual(['App.Web.Draw+Circle', 'App.Web.Circle', 'App.Circle', 'Circle', 'App.Core.Shapes.Circle']);
    expect(group.candidates[4].nestedOnly).toBe(true);
  });

  it('a namespace body reads it at its own namespace, behind that namespace\'s own member and before the global namespace', async () => {
    const { uses } = await run('namespace App.Web {\n  using static App.Core.Shapes;\n  class Draw { Circle c; }\n}\n');
    const keys = groupOf(uses, 'App.Core.Shapes.Circle').candidates.map((c) => c.symbolKey);
    expect(keys.indexOf('App.Web.Circle')).toBeLessThan(keys.indexOf('App.Web.App.Core.Shapes.Circle'));
    expect(keys.indexOf('App.Core.Shapes.Circle')).toBeLessThan(keys.indexOf('Circle'));
  });

  it('a target written after global:: is read from the global namespace only, in the compilation unit and in a namespace body', async () => {
    const { uses } = await run('namespace A {\n  using static global::App.Core.Shapes;\n  class Draw { Circle c; }\n}\n');
    const keys = uses.flatMap((u) => u.candidates.map((c) => c.symbolKey));
    expect(keys).toContain('App.Core.Shapes.Circle');
    expect(keys).not.toContain('A.App.Core.Shapes.Circle');
  });

  it('a generic target reads its nested types under its arity', async () => {
    const { uses } = await run('using static App.Repo<Order>;\nclass C { Item i; }\n');
    expect(groupOf(uses, 'App.Repo`1.Item')).toBeDefined();
  });

  it('an extension call reads the key the target class declares for the method, beside the namespaces the usings import', async () => {
    const { uses } = await run('using App.Plain;\nusing static App.Ext.StringExt;\nclass A { string M(string s) => s.Shout(); }\n');
    const group = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === 'App.Ext.StringExt.Shout()'));
    expect(group.candidates.map((c) => c.symbolKey)).toEqual(['Shout()', 'App.Plain.Shout()', 'App.Ext.StringExt.Shout()']);
  });

  it('declares each extension method under its namespace and under its class, and the global namespace\'s class as the bare class name', async () => {
    const { declarations } = await run('namespace N { public static class E { public static void M(this int x) { } } }\npublic static class G { public static void K(this int x) { } }\n');
    expect(declarations.map((d) => d.symbolKey)).toEqual(['N.E', 'N.M()', 'N.E.M()', 'G', 'K()', 'G.K()']);
  });
});

describe('csharp extractor — a file-local type ends the lookup of its name in its own file', () => {
  const keysOf = (uses) => uses.map((u) => u.candidates.map((c) => c.symbolKey));

  it('keeps only the nested type of the enclosing type when the file-local type is in the innermost namespace: no outer namespace, no global one, no using', async () => {
    const { uses } = await run('using Lib;\nnamespace App.Inner {\n  file class Helper { }\n  class C { Helper h; }\n}\n');
    expect(keysOf(uses)).toEqual([['App.Inner.C+Helper']]);
  });

  it('reads the namespaces nearer than the one that holds the file-local type first', async () => {
    const { uses } = await run('namespace App { file class Helper { } namespace Inner { class C { Helper h; } } }\n');
    expect(keysOf(uses)).toEqual([['App.Inner.C+Helper', 'App.Inner.Helper']]);
  });

  it('ends a dotted name at the file-local type it starts with, a qualified one written in full too', async () => {
    const { uses } = await run('namespace App;\nfile class Helper { public class Nested { } }\nclass C { Helper.Nested a; App.Helper b; }\n');
    expect(keysOf(uses)).toEqual([['App.C+Helper.Nested'], ['App.C+App.Helper', 'App.App.Helper']]);
  });

  it('gives no reading for a name written after global:: that is a file-local type of the global namespace', async () => {
    const { uses } = await run('file class Helper { }\nclass C { global::Helper h; }\n');
    expect(keysOf(uses)).toEqual([]);
  });

  it('ends the lookup before a set of imports that holds a file-local type', async () => {
    const { uses } = await run('using Lib;\nnamespace Lib { file class Order { } }\nnamespace App { class C { Order o; } }\n');
    expect(keysOf(uses)).toEqual([['App.C+Order', 'App.Order', 'Order']]);
  });

  it('reads a type nested in a file-local type, a dotted name through it included, before any namespace', async () => {
    const { uses } = await run('namespace App;\nfile class Outer { public class Inner { public class Deep { } } Inner a; Inner.Deep b; }\n');
    expect(keysOf(uses)).toEqual([]);
  });

  it('keeps a nested type of an enclosing type that comes before the file-local type', async () => {
    const { uses } = await run('namespace App;\nfile class Helper { }\npartial class C { Helper h; }\n');
    expect(keysOf(uses)).toEqual([['App.C+Helper']]);
  });

  it('declares nothing for a file-local type nor for a type nested in one', async () => {
    const { declarations } = await run('namespace App;\nfile class Helper { class Inner { } }\nclass C { }\n');
    expect(declarations.map((d) => d.symbolKey)).toEqual(['App.C', 'internal:App.C']);
  });
});
