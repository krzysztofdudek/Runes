// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/csharp.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { runExtractor } from '../../helpers/tree-sitter.mjs';
import { csharpExtractor, csharpUses } from '@chrisdudek/runes/relations';
import { withParsedFile } from '../../helpers/tree-sitter.mjs';
import { SymbolTable } from '@chrisdudek/runes/relations';
import { makeResolver } from '@chrisdudek/runes/relations';
import { withParsedFiles } from '../../helpers/tree-sitter.mjs';
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
const walkResolve = (uses, key, resolver, fromFile)=>{
    const dep = uses.find((u)=>u.candidates.some((c)=>c.kind === 'symbol' && c.symbolKey === key));
    if (dep === undefined) return undefined;
    for (const cand of dep.candidates){
        const outcome = resolver.classify(cand, fromFile, 'csharp');
        if (outcome.kind === 'resolved') return outcome.owner;
        if (outcome.kind === 'ambiguous') return undefined;
    }
    return undefined;
};
function parseAll(specs, fn) {
    return withParsedFiles(specs.map((s)=>({
            path: s.path,
            code: s.code,
            language: 'csharp'
        })), fn);
}
describe('csharp extractor — declarations() produce <Namespace>.<Type> FQN keys', ()=>{
    it('qualifies every type kind with a FILE-SCOPED namespace (namespace Foo.Bar;)', async ()=>{
        const { declarations } = await run([
            'namespace Foo.Bar;',
            'public class C { }',
            'public interface IThing { }',
            'public struct S { }',
            'public record Money(decimal A);',
            'public enum E { X }',
            ''
        ].join('\n'));
        const keys = declarations.map((d)=>d.symbolKey);
        expect(keys).toContain('Foo.Bar.C');
        expect(keys).toContain('Foo.Bar.IThing');
        expect(keys).toContain('Foo.Bar.S');
        expect(keys).toContain('Foo.Bar.Money');
        expect(keys).toContain('Foo.Bar.E');
    });
    it('qualifies with a BLOCK namespace and concatenates NESTED namespaces', async ()=>{
        const { declarations } = await run([
            'namespace Outer {',
            '  namespace Inner {',
            '    class C { }',
            '  }',
            '}',
            ''
        ].join('\n'));
        const keys = declarations.map((d)=>d.symbolKey);
        expect(keys).toContain('Outer.Inner.C');
    });
    it('uses the BARE type name when the type is at FILE SCOPE (no namespace)', async ()=>{
        const { declarations } = await run('class Loose { }\n');
        const keys = declarations.map((d)=>d.symbolKey);
        expect(keys).toContain('Loose');
        expect(keys.every((k)=>!k.startsWith('.'))).toBe(true);
    });
    it('carries a 1-based line number for each declaration', async ()=>{
        const { declarations } = await run('namespace N;\n\npublic class OnLineThree { }\n');
        const found = declarations.find((d)=>d.symbolKey === 'N.OnLineThree');
        expect(found?.line).toBe(3);
    });
});
describe('csharp extractor — declarations() key NESTED types with the reflection `+` separator', ()=>{
    it('keys a nested type `Outer+Inner` (and deeper `Outer+Obj+Deep`), NOT the bare simple name', async ()=>{
        const { declarations } = await run([
            'namespace App;',
            'class Outer {',
            '  class Inner { }',
            '  class Obj { class Deep { } }',
            '}',
            ''
        ].join('\n'));
        const keys = declarations.map((d)=>d.symbolKey);
        expect(keys).toContain('App.Outer');
        expect(keys).toContain('App.Outer+Inner');
        expect(keys).toContain('App.Outer+Obj');
        expect(keys).toContain('App.Outer+Obj+Deep');
        expect(keys).not.toContain('App.Inner');
        expect(keys).not.toContain('App.Deep');
        expect(keys).not.toContain('App.Obj');
    });
    it('keys a file-scope nested type `Outer+Inner` with no namespace prefix', async ()=>{
        const { declarations } = await run([
            'class Outer { class Inner { } }',
            ''
        ].join('\n'));
        const keys = declarations.map((d)=>d.symbolKey);
        expect(keys).toContain('Outer');
        expect(keys).toContain('Outer+Inner');
        expect(keys).not.toContain('Inner');
    });
});
describe('csharp extractor — uses() emits SYMBOL hints (never path hints)', ()=>{
    it('emits a FULLY-QUALIFIED `new Foo.Bar.Baz()` as the FQN candidate', async ()=>{
        const { uses } = await run([
            'class C { void M() { var o = new Foo.Bar.Baz(); } }',
            ''
        ].join('\n'));
        expect(symbolKeys(uses)).toContain('Foo.Bar.Baz');
        expect(uses.every((u)=>u.candidates[0].kind === 'symbol')).toBe(true);
    });
    it('inside a namespace, emits BOTH the enclosing-namespace expansion AND the verbatim form for a multi-segment qualified base type', async ()=>{
        const { uses } = await run([
            'namespace App;',
            'class C : Foo.Bar.Base { }',
            ''
        ].join('\n'));
        const keys = symbolKeys(uses);
        expect(keys).toContain('App.Foo.Bar.Base');
        expect(keys).toContain('Foo.Bar.Base');
    });
    it('emits a FULLY-QUALIFIED field type as the FQN candidate', async ()=>{
        const { uses } = await run([
            'class C { Foo.Bar.Dep _d; }',
            ''
        ].join('\n'));
        expect(symbolKeys(uses)).toContain('Foo.Bar.Dep');
    });
    it('qualifies a BARE base type via the using scope (`using Foo.Bar; ... : Baz`)', async ()=>{
        const { uses } = await run([
            'using Foo.Bar;',
            'class C : Baz { }',
            ''
        ].join('\n'));
        expect(symbolKeys(uses)).toContain('Foo.Bar.Baz');
    });
    it('qualifies a BARE `new Baz()` against EVERY using prefix (multiple candidates are safe)', async ()=>{
        const { uses } = await run([
            'using Foo.Bar;',
            'using Other.Ns;',
            'class C { void M() { var x = new Baz(); } }',
            ''
        ].join('\n'));
        const keys = symbolKeys(uses);
        expect(keys).toContain('Foo.Bar.Baz');
        expect(keys).toContain('Other.Ns.Baz');
    });
    it('resolves a BARE name through an ALIAS (`using Gw = Foo.Bar.IGateway;`) — alias expansion is the NEAREST candidate', async ()=>{
        const { uses } = await run([
            'using Gw = Foo.Bar.IGateway;',
            'class C { void M() { var x = new Gw(); } }',
            ''
        ].join('\n'));
        const group = groupContaining(uses, 'Foo.Bar.IGateway');
        expect(group?.[0]).toBe('Foo.Bar.IGateway');
        expect(group?.[group.length - 1]).toBe('Gw');
    });
    it('`using static X;` records NO namespace prefix — it imports a TYPE\'s members, not a namespace', async ()=>{
        const { uses } = await run([
            'using static Foo.Bar.Calc;',
            'class C : Baz { }',
            ''
        ].join('\n'));
        const keys = symbolKeys(uses);
        expect(keys).not.toContain('Foo.Bar.Baz');
        expect(keys.some((k)=>k.endsWith('.Baz'))).toBe(false);
    });
    it('does NOT honor `global using` from another file: a bare name with no in-file using stays SILENT at resolution', async ()=>{
        const { uses } = await run([
            'class C : SomeGlobalType { }',
            ''
        ].join('\n'));
        expect(symbolKeys(uses)).toEqual([
            'SomeGlobalType'
        ]);
        const st = new SymbolTable();
        const resolver = makeResolver({
            ownerIndex: {
                ownerOf: ()=>'someNode'
            },
            symbolTable: st,
            resolvePathToFile: ()=>undefined
        });
        expect(resolver.resolve({
            kind: 'symbol',
            symbolKey: 'SomeGlobalType'
        }, 'src/c/Use.cs', 'csharp')).toBeUndefined();
    });
    it('every hint is a SYMBOL hint (csharp resolves through the SymbolTable, never a path)', async ()=>{
        const { uses } = await run([
            'using Foo.Bar;',
            'class C : Baz { Foo.Bar.Dep _d; }',
            ''
        ].join('\n'));
        expect(uses.length).toBeGreaterThan(0);
        expect(uses.every((u)=>u.candidates[0].kind === 'symbol')).toBe(true);
    });
    it('honors `global using Foo.Bar;` as a plain namespace prefix for a bare base type', async ()=>{
        const { uses } = await run([
            'global using Foo.Bar;',
            'class C : Baz { }',
            ''
        ].join('\n'));
        expect(symbolKeys(uses)).toContain('Foo.Bar.Baz');
    });
    it('honors `global using Foo.Bar;` as a prefix for a bare `new Baz()` too', async ()=>{
        const { uses } = await run([
            'global using Foo.Bar;',
            'class C { void M() { var x = new Baz(); } }',
            ''
        ].join('\n'));
        expect(symbolKeys(uses)).toContain('Foo.Bar.Baz');
    });
    it('resolves a bare name through a `global using Alias = Foo.Bar.IGateway;` alias — alias expansion is NEAREST', async ()=>{
        const { uses } = await run([
            'global using Gw = Foo.Bar.IGateway;',
            'class C { void M() { var x = new Gw(); } }',
            ''
        ].join('\n'));
        const group = groupContaining(uses, 'Foo.Bar.IGateway');
        expect(group?.[0]).toBe('Foo.Bar.IGateway');
        expect(group?.[group.length - 1]).toBe('Gw');
    });
    it('emits a QUALIFIED base type (`: Foo.Bar.Base`) even with NO using directive', async ()=>{
        const { uses } = await run([
            'class C : Foo.Bar.Base { }',
            ''
        ].join('\n'));
        expect(symbolKeys(uses)).toContain('Foo.Bar.Base');
    });
    it('a GENERIC base type (`: List<int>`) emits its BASE name like a bare identifier (B5)', async ()=>{
        const { uses } = await run([
            'using Foo.Bar;',
            'class C : List<int> { }',
            ''
        ].join('\n'));
        expect(symbolKeys(uses)).toEqual([
            'Foo.Bar.List',
            'List'
        ]);
    });
    it('handles a base_list with MULTIPLE entries (qualified bare base + bare interface)', async ()=>{
        const { uses } = await run([
            'using N;',
            'class C : MyBase, IFoo<int> { }',
            ''
        ].join('\n'));
        const keys = symbolKeys(uses);
        expect(keys).toContain('N.MyBase');
        expect(keys).toContain('N.IFoo');
    });
    it('does NOT emit the namespace HEADER of a block `namespace Foo.Bar { }` as a use', async ()=>{
        const { uses, declarations } = await run([
            'namespace Foo.Bar { class C { } }',
            ''
        ].join('\n'));
        expect(symbolKeys(uses)).not.toContain('Foo.Bar');
        expect(symbolKeys(uses)).toHaveLength(0);
        expect(declarations.map((d)=>d.symbolKey)).toContain('Foo.Bar.C');
    });
    it('does NOT emit NESTED block namespace headers as uses (namespace A.B { namespace C.D { } })', async ()=>{
        const { uses, declarations } = await run([
            'namespace A.B { namespace C.D { class X { } } }',
            ''
        ].join('\n'));
        expect(symbolKeys(uses)).toHaveLength(0);
        expect(declarations.map((d)=>d.symbolKey)).toContain('A.B.C.D.X');
    });
    it('DEDUPES the SAME candidate key WITHIN one reference group (`: Foo.Bar, Foo.Bar`)', async ()=>{
        const { uses } = await run([
            'class C : Foo.Bar, Foo.Bar { }',
            ''
        ].join('\n'));
        for (const u of uses){
            const keys = u.candidates.flatMap((c)=>c.kind === 'symbol' ? [
                    c.symbolKey
                ] : []);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });
    it('DEDUPES a duplicate candidate produced by a REPEATED using prefix WITHIN the group', async ()=>{
        const { uses } = await run([
            'using A;',
            'using A;',
            'class C : Baz { }',
            ''
        ].join('\n'));
        const group = groupContaining(uses, 'A.Baz');
        expect(group?.filter((k)=>k === 'A.Baz')).toHaveLength(1);
    });
    it('inside a namespace, expands a multi-segment qualified ref against EACH using prefix too', async ()=>{
        const { uses } = await run([
            'using Domain;',
            'namespace App;',
            'class C { void M() { var o = new Models.Order(); } }',
            ''
        ].join('\n'));
        const keys = symbolKeys(uses);
        expect(keys).toContain('App.Models.Order');
        expect(keys).toContain('Domain.Models.Order');
        expect(keys).toContain('Models.Order');
    });
    it('inside a namespace with a using, expands a qualified BASE type the same way', async ()=>{
        const { uses } = await run([
            'using Domain;',
            'namespace App.Sub;',
            'class C : Models.Base { }',
            ''
        ].join('\n'));
        const keys = symbolKeys(uses);
        expect(keys).toContain('App.Sub.Models.Base');
        expect(keys).toContain('Domain.Models.Base');
        expect(keys).toContain('Models.Base');
    });
    it('at FILE SCOPE (no namespace, no using), keeps a multi-segment qualified ref VERBATIM only', async ()=>{
        const { uses } = await run([
            'class C { void M() { var o = new Foo.Bar.Baz(); } }',
            ''
        ].join('\n'));
        const keys = symbolKeys(uses);
        expect(keys).toContain('Foo.Bar.Baz');
        expect(keys).toEqual([
            'Foo.Bar.Baz'
        ]);
    });
    it('ORDERED GROUP: nearest expansion FIRST, verbatim LAST — and the verbatim binds when nothing nearer does (recall)', async ()=>{
        await parseAll([
            {
                path: 'src/c/Use.cs',
                code: 'namespace App;\nclass C { void M() { var o = new Models.Order(); } }\n'
            }
        ], ([consumer])=>{
            const group = groupContaining(csharpExtractor.uses(consumer), 'Models.Order');
            expect(group).toEqual([
                'App.Models.Order',
                'Models.Order'
            ]);
            const st = new SymbolTable();
            st.declare('csharp', 'Models.Order', 'src/m/Order.cs');
            const resolver = makeResolver({
                ownerIndex: {
                    ownerOf: (f)=>f === 'src/m/Order.cs' ? 'm' : undefined
                },
                symbolTable: st,
                resolvePathToFile: ()=>undefined
            });
            expect(resolver.classify({
                kind: 'symbol',
                symbolKey: 'App.Models.Order'
            }, consumer.path, 'csharp')).toEqual({
                kind: 'absent'
            });
            expect(resolver.classify({
                kind: 'symbol',
                symbolKey: 'Models.Order'
            }, consumer.path, 'csharp')).toEqual({
                kind: 'resolved',
                owner: 'm',
                resolvedFile: 'src/m/Order.cs'
            });
        });
    });
    it('DECISIVE FP (extractor/resolver level): a nearer using-relative split binds and the verbatim is NEVER reached', async ()=>{
        await parseAll([
            {
                path: 'src/n1/Order.cs',
                code: 'namespace App.Services;\nusing App.Data;\npublic class C { void M() { var o = new Models.Order(); } }\n'
            }
        ], ([consumer])=>{
            const st = new SymbolTable();
            st.declare('csharp', 'App.Data.Models', 'src/n1/Data.cs');
            st.declare('csharp', 'App.Data.Models+Order', 'src/n1/Data.cs');
            st.declare('csharp', 'Models.Order', 'src/n2/Order.cs');
            const resolver = makeResolver({
                ownerIndex: {
                    ownerOf: (f)=>f === 'src/n1/Data.cs' ? 'n1' : f === 'src/n2/Order.cs' ? 'n2' : undefined
                },
                symbolTable: st,
                resolvePathToFile: ()=>undefined
            });
            const group = groupContaining(csharpExtractor.uses(consumer), 'Models.Order');
            expect(group).toEqual([
                'App.Services.Models.Order',
                'App.Models.Order',
                'App.Data.Models.Order',
                'Models.Order'
            ]);
            const outcomes = group.map((k)=>resolver.classify({
                    kind: 'symbol',
                    symbolKey: k
                }, consumer.path, 'csharp'));
            expect(outcomes[0]).toEqual({
                kind: 'absent'
            });
            expect(outcomes[1]).toEqual({
                kind: 'absent'
            });
            expect(outcomes[2]).toEqual({
                kind: 'resolved',
                owner: 'n1',
                resolvedFile: 'src/n1/Data.cs'
            });
            expect(walkResolve(csharpExtractor.uses(consumer), 'Models.Order', resolver, consumer.path)).toBe('n1');
        });
    });
});
describe('csharp SYMBOL-TABLE resolution — the half this language validates', ()=>{
    it("builds a SymbolTable from two files' declarations() and resolves a third file's qualified use to the right file", async ()=>{
        await parseAll([
            {
                path: 'src/a/Gateway.cs',
                code: 'namespace MyApp.Payments;\npublic class Gateway { }\n'
            },
            {
                path: 'src/b/Audit.cs',
                code: 'namespace MyApp.Audit;\npublic class AuditLog { }\n'
            },
            {
                path: 'src/c/Order.cs',
                code: 'namespace MyApp.Orders;\nclass Order { void M() { var g = new MyApp.Payments.Gateway(); } }\n'
            }
        ], ([fileA, fileB, consumer])=>{
            const st = new SymbolTable();
            for (const f of [
                fileA,
                fileB
            ]){
                for (const d of csharpExtractor.declarations(f))st.declare('csharp', d.symbolKey, f.path);
            }
            const uses = csharpExtractor.uses(consumer);
            expect(groupContaining(uses, 'MyApp.Payments.Gateway')).toEqual([
                'MyApp.Orders.MyApp.Payments.Gateway',
                'MyApp.MyApp.Payments.Gateway',
                'MyApp.Payments.Gateway'
            ]);
            expect(st.resolveUnique('csharp', 'MyApp.Payments.Gateway')).toBe('src/a/Gateway.cs');
            const ownerIndex = {
                ownerOf: (f)=>f === 'src/a/Gateway.cs' ? 'a' : f === 'src/b/Audit.cs' ? 'b' : undefined
            };
            const resolver = makeResolver({
                ownerIndex: ownerIndex,
                symbolTable: st,
                resolvePathToFile: ()=>undefined
            });
            expect(walkResolve(uses, 'MyApp.Payments.Gateway', resolver, consumer.path)).toBe('a');
        });
    });
    it('BARE name resolves through the using scope to the right file', async ()=>{
        await parseAll([
            {
                path: 'src/a/Gateway.cs',
                code: 'namespace MyApp.Payments;\npublic class Gateway { }\n'
            },
            {
                path: 'src/c/Order.cs',
                code: 'using MyApp.Payments;\nnamespace MyApp.Orders;\nclass Order { void M() { var g = new Gateway(); } }\n'
            }
        ], ([fileA, consumer])=>{
            const st = new SymbolTable();
            for (const d of csharpExtractor.declarations(fileA))st.declare('csharp', d.symbolKey, fileA.path);
            const uses = csharpExtractor.uses(consumer);
            expect(groupContaining(uses, 'MyApp.Payments.Gateway')).toBeDefined();
            expect(st.resolveUnique('csharp', 'MyApp.Payments.Gateway')).toBe('src/a/Gateway.cs');
            const resolver = makeResolver({
                ownerIndex: {
                    ownerOf: (f)=>f === 'src/a/Gateway.cs' ? 'a' : undefined
                },
                symbolTable: st,
                resolvePathToFile: ()=>undefined
            });
            expect(walkResolve(uses, 'MyApp.Payments.Gateway', resolver, consumer.path)).toBe('a');
        });
    });
    it('AMBIGUITY: two files declaring the SAME FQN → a use of it resolves to undefined (silence, no flag)', async ()=>{
        await parseAll([
            {
                path: 'src/x/Thing.cs',
                code: 'namespace MyApp.Dup;\npublic class Thing { }\n'
            },
            {
                path: 'src/y/Thing.cs',
                code: 'namespace MyApp.Dup;\npublic class Thing { }\n'
            },
            {
                path: 'src/z/Use.cs',
                code: 'namespace MyApp.Z;\nclass Use { void M() { var t = new MyApp.Dup.Thing(); } }\n'
            }
        ], ([fileX, fileY, consumer])=>{
            const st = new SymbolTable();
            for (const f of [
                fileX,
                fileY
            ]){
                for (const d of csharpExtractor.declarations(f))st.declare('csharp', d.symbolKey, f.path);
            }
            expect(st.resolveUnique('csharp', 'MyApp.Dup.Thing')).toBeUndefined();
            const ownerIndex = {
                ownerOf: (f)=>f.split('/')[1]
            };
            const resolver = makeResolver({
                ownerIndex: ownerIndex,
                symbolTable: st,
                resolvePathToFile: ()=>undefined
            });
            const uses = csharpExtractor.uses(consumer);
            expect(resolver.classify({
                kind: 'symbol',
                symbolKey: 'MyApp.Dup.Thing'
            }, consumer.path, 'csharp')).toEqual({
                kind: 'ambiguous'
            });
            expect(walkResolve(uses, 'MyApp.Dup.Thing', resolver, consumer.path)).toBeUndefined();
        });
    });
});
describe('csharp anti-FALSE-POSITIVE — the silence list (D8 gate)', ()=>{
    const resolveAll = (uses, st, ownerOf)=>{
        const resolver = makeResolver({
            ownerIndex: {
                ownerOf
            },
            symbolTable: st,
            resolvePathToFile: ()=>undefined
        });
        return uses.map((u)=>{
            for (const cand of u.candidates){
                const outcome = resolver.classify(cand, 'src/c/Use.cs', 'csharp');
                if (outcome.kind === 'resolved') return outcome.owner;
                if (outcome.kind === 'ambiguous') return undefined;
            }
            return undefined;
        });
    };
    it('DI-container registration emits NO cross-node flag (services.AddScoped<IFoo, Foo>())', async ()=>{
        const { uses } = await run([
            'using Microsoft.Extensions.DependencyInjection;',
            'class Startup {',
            '  void Configure(IServiceCollection services) {',
            '    services.AddScoped<IFoo, Foo>();',
            '  }',
            '}',
            ''
        ].join('\n'));
        const owners = resolveAll(uses, new SymbolTable(), ()=>undefined);
        expect(owners.every((o)=>o === undefined)).toBe(true);
    });
    it('REFLECTION emits NO flag (Type.GetType / Activator.CreateInstance with string names)', async ()=>{
        const { uses } = await run([
            'using System;',
            'class R {',
            '  void M() {',
            '    var t = Type.GetType("MyApp.Payments.Gateway");',
            '    var o = Activator.CreateInstance(t);',
            '  }',
            '}',
            ''
        ].join('\n'));
        const st = new SymbolTable();
        st.declare('csharp', 'MyApp.Payments.Gateway', 'src/pay/Gateway.cs');
        const owners = resolveAll(uses, st, (f)=>f === 'src/pay/Gateway.cs' ? 'pay' : undefined);
        expect(owners.every((o)=>o === undefined)).toBe(true);
    });
    it('EXTENSION METHOD call emits ONLY an extension-method key (order.Validate()), never a type key', async ()=>{
        const { uses } = await run([
            'class C { void M(object order) { order.Validate(); } }',
            ''
        ].join('\n'));
        expect(symbolKeys(uses)).toEqual([
            'Validate()'
        ]);
    });
    it('SOURCE-GENERATED / partial type emits NO flag (partial class, no base/new)', async ()=>{
        const { uses } = await run([
            'namespace App;',
            'partial class Gen { }',
            ''
        ].join('\n'));
        expect(symbolKeys(uses)).toHaveLength(0);
    });
    it('`using static X;` emits the fully-qualified TARGET as a sole candidate, NO namespace-prefix expansion', async ()=>{
        const { uses } = await run([
            'using static MyApp.Math.Calc;',
            'class C { void M() { var r = Compute(); } }',
            ''
        ].join('\n'));
        const target = uses.find((u)=>u.candidates.some((c)=>c.kind === 'symbol' && c.symbolKey === 'MyApp.Math.Calc'));
        expect(target).toBeDefined();
        expect(target.candidates).toHaveLength(1);
        expect(symbolKeys(uses).filter((k)=>k.startsWith('MyApp.Math'))).toEqual([
            'MyApp.Math.Calc'
        ]);
    });
    it('`global using` from ANOTHER file is invisible: a bare type stays SILENT at resolution', async ()=>{
        const { uses } = await run([
            'class C : RepositoryBase { }',
            ''
        ].join('\n'));
        expect(symbolKeys(uses)).toEqual([
            'RepositoryBase'
        ]);
        const owners = resolveAll(uses, new SymbolTable(), ()=>undefined);
        expect(owners.every((o)=>o === undefined)).toBe(true);
    });
    it('EXTERNAL/BCL type resolves to NO node (System.* → external, never a violation)', async ()=>{
        const { uses } = await run([
            'class C { System.Text.StringBuilder _sb; void M() { var x = new System.Collections.Generic.List<int>(); } }',
            ''
        ].join('\n'));
        const owners = resolveAll(uses, new SymbolTable(), ()=>undefined);
        expect(owners.every((o)=>o === undefined)).toBe(true);
    });
    it('dependency onto an UNMAPPED type (declared in table, file owned by NO node) → undefined', async ()=>{
        const { uses } = await run([
            'class C { void M() { var x = new Foo.Bar.Baz(); } }',
            ''
        ].join('\n'));
        const st = new SymbolTable();
        st.declare('csharp', 'Foo.Bar.Baz', 'src/unmapped/Baz.cs');
        const owners = resolveAll(uses, st, ()=>undefined);
        expect(owners.every((o)=>o === undefined)).toBe(true);
    });
    it('INTRA-NODE / family reference: resolves to a file, but to the consumer\'s OWN node (no flag at verify layer)', async ()=>{
        const { uses } = await run([
            'namespace App;',
            'class C { void M() { var x = new App.Sibling(); } }',
            ''
        ].join('\n'));
        const st = new SymbolTable();
        st.declare('csharp', 'App.Sibling', 'src/c/Sibling.cs');
        const owners = resolveAll(uses, st, (f)=>f === 'src/c/Sibling.cs' ? 'c' : undefined);
        expect(owners).toContain('c');
    });
});
describe('csharp NESTED-TYPE resolution + the tri-state / split over-silence guards', ()=>{
    const walk = (uses, key, st, ownerOf, fromFile)=>{
        const resolver = makeResolver({
            ownerIndex: {
                ownerOf
            },
            symbolTable: st,
            resolvePathToFile: ()=>undefined
        });
        return walkResolve(uses, key, resolver, fromFile);
    };
    it('RECALL: a cross-node use of `Outer.Inner` resolves to the declaring node via the guarded `+`-split', async ()=>{
        await parseAll([
            {
                path: 'src/a/Nested.cs',
                code: 'namespace App;\nclass Outer { class Inner { } }\n'
            },
            {
                path: 'src/c/Use.cs',
                code: 'namespace Other;\nclass C { void M() { var x = new App.Outer.Inner(); } }\n'
            }
        ], ([decl, consumer])=>{
            const st = new SymbolTable();
            for (const d of csharpExtractor.declarations(decl))st.declare('csharp', d.symbolKey, decl.path);
            expect(st.has('csharp', 'App.Outer')).toBe(true);
            expect(st.resolveUnique('csharp', 'App.Outer+Inner')).toBe('src/a/Nested.cs');
            const owners = csharpExtractor.uses(consumer);
            expect(walk(owners, 'App.Outer.Inner', st, (f)=>f === 'src/a/Nested.cs' ? 'a' : undefined, consumer.path)).toBe('a');
        });
    });
    it('COLLISION HEALED: a nested `App.Outer+Inner` no longer shadows a top-level `App.Inner` (D-N5)', async ()=>{
        await parseAll([
            {
                path: 'src/a/Nested.cs',
                code: 'namespace App;\nclass Outer { class Inner { } }\n'
            },
            {
                path: 'src/b/Inner.cs',
                code: 'namespace App;\nclass Inner { }\n'
            },
            {
                path: 'src/c/Use.cs',
                code: 'namespace Other;\nclass C { void M() { var x = new App.Inner(); } }\n'
            }
        ], ([nested, topLevel, consumer])=>{
            const st = new SymbolTable();
            for (const f of [
                nested,
                topLevel
            ]){
                for (const d of csharpExtractor.declarations(f))st.declare('csharp', d.symbolKey, f.path);
            }
            expect(st.resolveUnique('csharp', 'App.Inner')).toBe('src/b/Inner.cs');
            const owners = csharpExtractor.uses(consumer);
            expect(walk(owners, 'App.Inner', st, (f)=>f === 'src/b/Inner.cs' ? 'b' : undefined, consumer.path)).toBe('b');
        });
    });
    it('GUARD HOLDS: a namespace-`Foo` type-`Bar` use is NOT re-read as nested `Foo+Bar` even if one coincidentally exists', async ()=>{
        await parseAll([
            {
                path: 'src/y/Coin.cs',
                code: 'namespace App;\nclass Foo { class Bar { } }\n'
            },
            {
                path: 'src/x/Bar.cs',
                code: 'namespace Foo;\nclass Bar { }\n'
            },
            {
                path: 'src/c/Use.cs',
                code: 'namespace Other;\nclass C { void M() { var x = new Foo.Bar(); } }\n'
            }
        ], ([coincidental, real, consumer])=>{
            const st = new SymbolTable();
            for (const f of [
                coincidental,
                real
            ]){
                for (const d of csharpExtractor.declarations(f))st.declare('csharp', d.symbolKey, f.path);
            }
            expect(st.has('csharp', 'Foo')).toBe(false);
            const owners = csharpExtractor.uses(consumer);
            expect(walk(owners, 'Foo.Bar', st, (f)=>f === 'src/x/Bar.cs' ? 'x' : f === 'src/y/Coin.cs' ? 'y' : undefined, consumer.path)).toBe('x');
        });
    });
    it('SPLIT AMBIGUITY SILENCES: two mapped files both declaring `App.Outer+Inner` → silence, not a flag', async ()=>{
        await parseAll([
            {
                path: 'src/a/Nested.cs',
                code: 'namespace App;\nclass Outer { class Inner { } }\n'
            },
            {
                path: 'src/b/Nested.cs',
                code: 'namespace App;\nclass Outer { class Inner { } }\n'
            },
            {
                path: 'src/c/Use.cs',
                code: 'namespace Other;\nclass C { void M() { var x = new App.Outer.Inner(); } }\n'
            }
        ], ([a, b, consumer])=>{
            const st = new SymbolTable();
            for (const f of [
                a,
                b
            ]){
                for (const d of csharpExtractor.declarations(f))st.declare('csharp', d.symbolKey, f.path);
            }
            const owners = csharpExtractor.uses(consumer);
            expect(walk(owners, 'App.Outer.Inner', st, (f)=>f.split('/')[1], consumer.path)).toBeUndefined();
        });
    });
    it('USING-LEVEL CS0104: two usings each defining `Widget` → the using tier is AMBIGUOUS → SILENCE (never the foreign verbatim either)', async ()=>{
        await parseAll([
            {
                path: 'src/a/W.cs',
                code: 'namespace L1;\nclass Widget { }\n'
            },
            {
                path: 'src/b/W.cs',
                code: 'namespace L2;\nclass Widget { }\n'
            },
            {
                path: 'src/d/W.cs',
                code: 'class Widget { }\n'
            },
            {
                path: 'src/c/Use.cs',
                code: 'using L1;\nusing L2;\nnamespace App;\nclass C : Widget { }\n'
            }
        ], ([l1, l2, verbatim, consumer])=>{
            const st = new SymbolTable();
            for (const f of [
                l1,
                l2,
                verbatim
            ]){
                for (const d of csharpExtractor.declarations(f))st.declare('csharp', d.symbolKey, f.path);
            }
            const owners = csharpExtractor.uses(consumer);
            const group = groupContaining(owners, 'Widget');
            expect(group).toEqual([
                'App.Widget',
                'L1.Widget',
                'L2.Widget',
                'Widget'
            ]);
            expect(group[group.length - 1]).toBe('Widget');
            const resolver = makeResolver({
                ownerIndex: {
                    ownerOf: (f)=>f === 'src/a/W.cs' ? 'a' : f === 'src/b/W.cs' ? 'b' : f === 'src/d/W.cs' ? 'd' : undefined
                },
                symbolTable: st,
                resolvePathToFile: ()=>undefined
            });
            const bound = walkResolve(owners, 'Widget', resolver, consumer.path);
            expect(bound).toBeUndefined();
        });
    });
});
describe('csharp extractor — registry wiring', ()=>{
    it('declares the csharp language', ()=>{
        expect(csharpExtractor.languages.has('csharp')).toBe(true);
    });
});
describe('csharp — extension-method declaration keys (m27)', ()=>{
    it('a classic `this` extension in a top-level static class declares `<ns>.<Name>()`', async ()=>{
        const { declarations } = await run([
            'namespace Shop.Infra;',
            'public static class DI {',
            '  public static object AddInfra(this object s) => s;',
            '  public static void Plain(object s) {}',
            '}',
            ''
        ].join('\n'));
        const keys = declarations.map((d)=>d.symbolKey);
        expect(keys).toContain('Shop.Infra.AddInfra()');
        expect(keys).not.toContain('Shop.Infra.Plain()');
    });
    it('a `this` method in a NON-static, nested, or file-local class declares no extension key', async ()=>{
        const { declarations } = await run([
            'namespace N;',
            'public class NotStatic { public static void A(this object s) {} }',
            'public static class Outer { public static class Inner { public static void B(this object s) {} } }',
            'file static class Local { public static void C(this object s) {} }',
            ''
        ].join('\n'));
        expect(declarations.map((d)=>d.symbolKey).filter((k)=>k.endsWith('()'))).toEqual([]);
    });
    it('a C# 14 extension-block member declares a key on the shipped grammar (misread block)', async ()=>{
        const { declarations } = await run([
            'namespace N;',
            'public static class E { extension(object o) { public int Size() => 0; } }',
            ''
        ].join('\n'));
        expect(declarations.map((d)=>d.symbolKey)).toContain('N.Size()');
    });
});
describe('csharp — member-access receivers and extension calls (M16, m27)', ()=>{
    const groups = (uses)=>uses.map((u)=>u.candidates.flatMap((c)=>c.kind === 'symbol' ? [
                    c.symbolKey
                ] : []));
    it('a dotted receiver emits ONE group of its prefixes, leftmost first', async ()=>{
        const { uses } = await run([
            'class C { void M(object o) { Shop.Core.Guard.NotNull(o); } }',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'Shop',
                'Shop.Core',
                'Shop.Core.Guard'
            ]
        ]);
    });
    it('a receiver inside nameof(…) emits nothing', async ()=>{
        const { uses } = await run([
            'class C { string M() => nameof(Guard.NotNull); }',
            ''
        ].join('\n'));
        expect(uses).toHaveLength(0);
    });
    it('a value receiver emits an extension group, never a type group', async ()=>{
        const { uses } = await run([
            'using Shop.Infra;',
            'class C { void M(object s) { s.AddInfra(); } }',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'Shop.Infra.AddInfra()',
                'AddInfra()'
            ]
        ]);
    });
    it('an unshadowed type-name receiver emits no extension group (a static call)', async ()=>{
        const { uses } = await run([
            'class C { void M() { Guard.Check(); } }',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'Guard'
            ]
        ]);
    });
    it('System.Object members, names the file declares as methods, and base.X() are never extension calls', async ()=>{
        const { uses } = await run([
            'class C : B { void Run() {} void M(object s) { s.ToString(); s.Equals(s); s.Run(); base.Go(); } }',
            ''
        ].join('\n'));
        expect(groups(uses).filter((g)=>g.some((k)=>k.endsWith('()')))).toEqual([]);
    });
    it('a null-conditional call `s?.AddInfra()` is an extension call too', async ()=>{
        const { uses } = await run([
            'class C { void M(object s) { s?.AddInfra(); } }',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'AddInfra()'
            ]
        ]);
    });
    it('a generic receiver `Result<Order>.Ok()` is a type position (base + argument)', async ()=>{
        const { uses } = await run([
            'class C { void M() { Result<Order>.Ok(); } }',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'Result'
            ],
            [
                'Order'
            ]
        ]);
    });
    it('a qualified generic `A.B<C>.D` resolves by its plain dotted name, with its arguments', async ()=>{
        const { uses } = await run([
            'class C { A.B<X.Y>.D f; }',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'A.B.D'
            ],
            [
                'X.Y'
            ]
        ]);
    });
    it('a closed-generic alias target binds by its plain container name', async ()=>{
        const { uses } = await run([
            'using R = Shop.Core.Repository<int>;',
            'class C { R r; }',
            ''
        ].join('\n'));
        expect(groups(uses)[0][0]).toBe('Shop.Core.Repository');
    });
});
describe('csharp — project-wide global alias with 2+ targets (M7)', ()=>{
    it('silences every reference led by the ambiguous alias; a file-local alias still wins', async ()=>{
        const code = [
            'class C { Money m; }',
            ''
        ].join('\n');
        await withParsedFile('x.cs', code, (tree)=>{
            const file = {
                path: 'x.cs',
                content: code,
                tree,
                language: 'csharp'
            };
            const ambiguous = csharpUses(file, {
                projectGlobalUsingAliases: [
                    [
                        'Money',
                        'A.Money'
                    ],
                    [
                        'Money',
                        'B.Money'
                    ]
                ]
            });
            expect(ambiguous).toHaveLength(0);
            const single = csharpUses(file, {
                projectGlobalUsingAliases: [
                    [
                        'Money',
                        'A.Money'
                    ]
                ]
            });
            expect(single[0].candidates[0]).toMatchObject({
                kind: 'symbol',
                symbolKey: 'A.Money'
            });
        });
        const local = [
            'using Money = L.Money;',
            'class C { Money m; }',
            ''
        ].join('\n');
        await withParsedFile('y.cs', local, (tree)=>{
            const file = {
                path: 'y.cs',
                content: local,
                tree,
                language: 'csharp'
            };
            const uses = csharpUses(file, {
                projectGlobalUsingAliases: [
                    [
                        'Money',
                        'A.Money'
                    ],
                    [
                        'Money',
                        'B.Money'
                    ]
                ]
            });
            expect(uses[0].candidates[0]).toMatchObject({
                kind: 'symbol',
                symbolKey: 'L.Money'
            });
        });
    });
});
describe('csharp — extension and receiver shapes that must NOT count (branch guards)', ()=>{
    const groups = (uses)=>uses.map((u)=>u.candidates.flatMap((c)=>c.kind === 'symbol' ? [
                    c.symbolKey
                ] : []));
    it('only a static top-level class member with a `this` receiver, or a misread extension block member, is an extension', async ()=>{
        const { declarations } = await run([
            'namespace N;',
            'public interface I { void A(object s); }',
            'public static class S {',
            '  public static void NoParams() {}',
            '  public static void Helper(object s) { void Local() {} }',
            '  static S() { void InCtor() {} }',
            '}',
            ''
        ].join('\n'));
        expect(declarations.map((d)=>d.symbolKey).filter((k)=>k.endsWith('()'))).toEqual([]);
    });
    it('a generic extension call `s.Get<int>()` is looked up by its base name', async ()=>{
        const { uses } = await run([
            'class C { void M(object s) { s.Get<int>(); } }',
            ''
        ].join('\n'));
        expect(groups(uses)).toEqual([
            [
                'Get()'
            ]
        ]);
    });
    it('a plain call `Foo()` and an element-access call are not member calls', async ()=>{
        const { uses } = await run([
            'class C { void M(System.Action[] a) { Foo(); a[0](); } }',
            ''
        ].join('\n'));
        expect(groups(uses).filter((g)=>g.some((k)=>k.endsWith('()')))).toEqual([]);
    });
    it('a deconstructing foreach declares its names through the pattern', async ()=>{
        const { uses } = await run([
            'class C { void M(object xs) { foreach (var (Guard, b) in xs) { Guard.X(); } } }',
            ''
        ].join('\n'));
        expect(groups(uses).filter((g)=>g.includes('Guard'))).toEqual([]);
    });
    it('a lambda parameter shadows a type name', async ()=>{
        const { uses } = await run([
            'class C { System.Func<object, object> f = Guard => Guard.ToString(); }',
            ''
        ].join('\n'));
        expect(groups(uses).filter((g)=>g.includes('Guard'))).toEqual([]);
    });
    it('a generic segment ends the receiver chain (`A.B<int>.C()`)', async ()=>{
        const { uses } = await run([
            'class C { void M() { A.B<int>.C(); } }',
            ''
        ].join('\n'));
        expect(groups(uses)).toContainEqual([
            'A'
        ]);
    });
    it('a `global::` qualified generic resolves from the root; a non-global alias-qualified generic emits nothing', async ()=>{
        const { uses } = await run([
            'class C { global::A.B<X> f; Lib::A<X>.B g; }',
            ''
        ].join('\n'));
        const g = groups(uses);
        expect(g).toContainEqual([
            'A.B'
        ]);
        expect(g.flat().some((k)=>k.includes('Lib'))).toBe(false);
    });
});
