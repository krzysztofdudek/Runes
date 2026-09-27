// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/csharp-branch-coverage.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { runExtractor } from '../../helpers/tree-sitter.mjs';
import { csharpExtractor } from '@chrisdudek/runes/relations';
const run = (code)=>runExtractor(csharpExtractor, 'csharp', '.cs', code);
const symbolKeys = (uses)=>uses.flatMap((u)=>u.candidates.flatMap((c)=>c.kind === 'symbol' ? [
                c.symbolKey
            ] : []));
const groupContaining = (uses, key)=>{
    const dep = uses.find((u)=>u.candidates.some((c)=>c.kind === 'symbol' && c.symbolKey === key));
    return dep?.candidates.flatMap((c)=>c.kind === 'symbol' ? [
            c.symbolKey
        ] : []);
};
describe('csharp extractor — attribute usages emit a two-reading group', ()=>{
    it('emits BOTH the verbatim and the `Attribute`-suffixed reading for `[Foo]`', async ()=>{
        const { uses } = await run('namespace App;\n[Route]\nclass Handler {}\n');
        const keys = symbolKeys(uses);
        expect(keys).toContain('Route');
        expect(keys).toContain('RouteAttribute');
        const group = groupContaining(uses, 'Route');
        expect(group).toContain('Route');
        expect(group).toContain('RouteAttribute');
    });
    it('does NOT double-suffix an already-`Attribute`-suffixed name `[FooAttribute]`', async ()=>{
        const { uses } = await run('namespace App;\n[RouteAttribute]\nclass Handler {}\n');
        const keys = symbolKeys(uses);
        expect(keys).toContain('RouteAttribute');
        expect(keys).not.toContain('RouteAttributeAttribute');
    });
    it('reads a generic attribute `[Foo<Bar>]` as the base name plus each type argument', async ()=>{
        const { uses } = await run('namespace App;\n[Validate<Models.Customer>]\nclass Handler {}\n');
        const keys = symbolKeys(uses);
        expect(keys).toContain('Validate');
        expect(keys).toContain('ValidateAttribute');
        expect(keys).toContain('Models.Customer');
    });
});
describe('csharp extractor — tuple element types are real references', ()=>{
    it('emits each NAMED element type of a tuple field type', async ()=>{
        const { uses } = await run('namespace App;\nclass C {\n  (int, Models.Customer) Pair;\n}\n');
        const keys = symbolKeys(uses);
        expect(keys).toContain('Models.Customer');
    });
});
describe('csharp extractor — global:: and namespace-alias inline references', ()=>{
    it('resolves a `global::A.B.C` reference from the root as its sole candidate', async ()=>{
        const { uses } = await run('namespace App;\nclass C {\n  global::Other.Models.User U;\n}\n');
        const keys = symbolKeys(uses);
        expect(keys).toContain('Other.Models.User');
        const group = groupContaining(uses, 'Other.Models.User');
        expect(group).toEqual([
            'Other.Models.User'
        ]);
    });
    it('rewrites a `using`-alias-qualified `S::Tail` reference to the aliased FQN', async ()=>{
        const { uses } = await run('using S = App.Space;\nnamespace App;\nclass C {\n  S::Widget W;\n}\n');
        const keys = symbolKeys(uses);
        expect(keys).toContain('App.Space.Widget');
    });
    it('leaves a non-global `::`-qualified reference intact (silence-by-luck at resolution)', async ()=>{
        const { uses } = await run('namespace App;\nclass C {\n  Lib::Space.Widget W;\n}\n');
        const keys = symbolKeys(uses);
        expect(keys).toContain('Lib::Space.Widget');
        expect(keys).not.toContain('Space.Widget');
    });
});
describe('csharp extractor — C#12 alias-RHS embedded named types', ()=>{
    it('harvests a named type embedded in an alias RHS TUPLE', async ()=>{
        const { uses } = await run('using P = (int, App.Models.Order);\nclass C {}\n');
        const keys = symbolKeys(uses);
        expect(keys).toContain('App.Models.Order');
    });
    it('harvests a named type embedded in an alias RHS ARRAY', async ()=>{
        const { uses } = await run('using A = App.Models.Row[];\nclass C {}\n');
        const keys = symbolKeys(uses);
        expect(keys).toContain('App.Models.Row');
    });
});
describe('csharp extractor — is-pattern constant type reference', ()=>{
    it('emits the bare type named in an `o is Zed` constant pattern', async ()=>{
        const { uses } = await run('namespace App;\nclass C {\n  bool M(object o) => o is Widget;\n}\n');
        const keys = symbolKeys(uses);
        expect(keys).toContain('Widget');
    });
});
describe('csharp extractor — block namespace declaration', ()=>{
    it('qualifies types by a BLOCK namespace and does not treat the namespace name as a use', async ()=>{
        const { declarations, uses } = await run('namespace App.Services {\n  class Handler {\n    Models.Customer C;\n  }\n}\n');
        expect(declarations.map((d)=>d.symbolKey)).toContain('App.Services.Handler');
        const keys = symbolKeys(uses);
        expect(keys).not.toContain('App.Services');
        expect(keys.some((k)=>k.endsWith('Models.Customer'))).toBe(true);
    });
});
