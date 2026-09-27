// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/java.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { runExtractor } from '../../helpers/tree-sitter.mjs';
import { javaExtractor } from '@chrisdudek/runes/relations';
const run = (code)=>runExtractor(javaExtractor, 'java', '.java', code);
const specs = (uses)=>uses.flatMap((u)=>u.candidates[0].kind === 'path' ? [
            u.candidates[0].specifier
        ] : []);
const hintFor = (uses, specifier)=>uses.map((u)=>u.candidates[0]).find((h)=>h.kind === 'path' && h.specifier === specifier);
describe('java extractor — uses()', ()=>{
    it('emits the type FQN for a single-type import', async ()=>{
        const { uses } = await run('import com.acme.payments.PaymentService;\nclass C {}\n');
        expect(uses).toContainEqual(expect.objectContaining({
            candidates: [
                expect.objectContaining({
                    kind: 'path',
                    specifier: 'com.acme.payments.PaymentService'
                })
            ],
            kind: 'import'
        }));
    });
    it('drops the trailing member of a static import (emits the type FQN)', async ()=>{
        const { uses } = await run('import static com.acme.util.Helpers.format;\nclass C {}\n');
        const s = specs(uses);
        expect(s).toContain('com.acme.util.Helpers');
        expect(s).not.toContain('com.acme.util.Helpers.format');
    });
    it('emits the PACKAGE FQN for a wildcard import', async ()=>{
        const { uses } = await run('import com.acme.audit.*;\nclass C {}\n');
        const s = specs(uses);
        expect(s).toContain('com.acme.audit');
        expect(s.every((x)=>!x.includes('*'))).toBe(true);
    });
    it('keeps the class FQN intact for a static-on-demand import', async ()=>{
        const { uses } = await run('import static com.acme.util.Constants.*;\nclass C {}\n');
        const s = specs(uses);
        expect(s).toContain('com.acme.util.Constants');
        expect(s.every((x)=>!x.includes('*'))).toBe(true);
    });
    it('emits a stdlib import FQN unchanged (silencing is the resolver job)', async ()=>{
        const { uses } = await run('import java.util.List;\nclass C {}\n');
        expect(specs(uses)).toContain('java.util.List');
    });
    it('emits the FQN of a nested-type import verbatim', async ()=>{
        const { uses } = await run('import com.foo.Outer.Inner;\nclass C {}\n');
        expect(specs(uses)).toContain('com.foo.Outer.Inner');
    });
    it('emits the bare segment of a single-segment import (identifier child, not scoped_identifier)', async ()=>{
        const { uses } = await run('import Foo;\nclass C {}\n');
        expect(specs(uses)).toContain('Foo');
    });
    it('emits NOTHING for a static import of a bare single segment (no type segment to keep)', async ()=>{
        const { uses } = await run('import static Foo;\nclass C {}\n');
        expect(uses).toHaveLength(0);
    });
    it('emits NOTHING for an import with an empty FQN (empty-specifier guard)', async ()=>{
        const { uses } = await run('import ;\nclass C {}\n');
        expect(uses).toHaveLength(0);
    });
    it('emits the class FQN for a static-on-demand wildcard (asterisk wins over static)', async ()=>{
        const { uses } = await run('import static com.foo.*;\nclass C {}\n');
        const s = specs(uses);
        expect(s).toContain('com.foo');
        expect(s.every((x)=>!x.includes('*'))).toBe(true);
    });
    it('deduplicates two identical imports that begin on the same line', async ()=>{
        const { uses } = await run('import a.B; import a.B;\nclass C {}\n');
        const s = specs(uses);
        expect(s).toEqual([
            'a.B'
        ]);
    });
    it('collects every import in a multi-import file', async ()=>{
        const { uses } = await run([
            'package com.acme.app;',
            'import com.acme.a.Alpha;',
            'import com.acme.b.Beta;',
            'class C {}',
            ''
        ].join('\n'));
        const s = specs(uses);
        expect(s).toContain('com.acme.a.Alpha');
        expect(s).toContain('com.acme.b.Beta');
    });
    it('tags the wildcard package hint with isPackage: true', async ()=>{
        const { uses } = await run('import com.acme.audit.*;\nclass C {}\n');
        const h = hintFor(uses, 'com.acme.audit');
        expect(h).toBeDefined();
        expect(h?.isPackage).toBe(true);
    });
    it('does NOT tag a single-type import as a package', async ()=>{
        const { uses } = await run('import com.acme.payments.PaymentService;\nclass C {}\n');
        const h = hintFor(uses, 'com.acme.payments.PaymentService');
        expect(h).toBeDefined();
        expect(h?.isPackage).toBeFalsy();
    });
    it('does NOT tag a static-on-demand import as a package (the FQN is the class)', async ()=>{
        const { uses } = await run('import static com.acme.util.Constants.*;\nclass C {}\n');
        const h = hintFor(uses, 'com.acme.util.Constants');
        expect(h).toBeDefined();
        expect(h?.isPackage).toBeFalsy();
    });
    it('emits NOTHING for a module import declaration `import module M;` (JEP 511)', async ()=>{
        const { uses } = await run('package com.app;\nimport module java.base;\nimport module com.acme.lib;\nclass C {}\n');
        expect(uses).toHaveLength(0);
    });
    it('emits the service + provider TYPE FQNs of module-info uses / provides directives', async ()=>{
        const { uses } = await run([
            'module com.example.foo {',
            '  requires com.acme.req.ReqType;',
            '  exports com.acme.exp.ExpType;',
            '  opens com.acme.opn.OpnType;',
            '  uses com.acme.spi.Intf;',
            '  provides com.acme.spi.Intf with com.acme.impl.Impl, com.acme.impl.Impl2;',
            '}',
            ''
        ].join('\n'));
        const s = specs(uses);
        expect(s).toContain('com.acme.spi.Intf');
        expect(s).toContain('com.acme.impl.Impl');
        expect(s).toContain('com.acme.impl.Impl2');
        expect(s).not.toContain('com.acme.req.ReqType');
        expect(s).not.toContain('com.acme.exp.ExpType');
        expect(s).not.toContain('com.acme.opn.OpnType');
        expect(uses.every((u)=>u.candidates[0].kind === 'path' && u.candidates[0].isPackage !== true)).toBe(true);
    });
    it('emits a SYMBOL hint for an inline fully-qualified TYPE reference (extends), but NOT for expression-position dotted calls or same-package bare names', async ()=>{
        const { uses } = await run([
            'package com.acme.app;',
            'class C extends com.acme.base.Base implements com.acme.flow.Flowable {',
            '  void m() {',
            '    Object o = new com.acme.metrics.Timer();',
            '    com.acme.audit.AuditLog.record("x");',
            '  }',
            '}',
            'class D extends Other {}',
            ''
        ].join('\n'));
        const symbolKeys = uses.flatMap((u)=>u.candidates[0].kind === 'symbol' ? [
                u.candidates[0].symbolKey
            ] : []);
        expect(symbolKeys).toContain('com.acme.base.Base');
        expect(symbolKeys).toContain('com.acme.flow.Flowable');
        expect(symbolKeys).toContain('com.acme.metrics.Timer');
        expect(uses.every((u)=>u.candidates[0].kind === 'symbol')).toBe(true);
        expect(symbolKeys.some((k)=>k.startsWith('com.acme.audit'))).toBe(false);
        expect(symbolKeys).not.toContain('Other');
    });
});
describe('java extractor — declarations()', ()=>{
    it('returns class / interface / enum / record names', async ()=>{
        const { declarations } = await run([
            'class Foo {}',
            'interface Bar {}',
            'enum Baz { A, B }',
            'record Qux(int a) {}',
            ''
        ].join('\n'));
        const keys = declarations.map((d)=>d.symbolKey);
        expect(keys).toContain('Foo');
        expect(keys).toContain('Bar');
        expect(keys).toContain('Baz');
        expect(keys).toContain('Qux');
    });
    it('carries a 1-based line number for each declaration', async ()=>{
        const { declarations } = await run('\nclass OnLineTwo {}\n');
        const foo = declarations.find((d)=>d.symbolKey === 'OnLineTwo');
        expect(foo?.line).toBe(2);
    });
});
