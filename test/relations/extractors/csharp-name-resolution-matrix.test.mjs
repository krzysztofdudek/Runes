// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/csharp-name-resolution-matrix.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { runCase } from '../reference-case-runner.mjs';
import { withParsedFile } from '../../helpers/tree-sitter.mjs';
describe('MATRIX — using-import & alias forms', ()=>{
    it('csharp-plain-using-simple-name', ()=>runCase('csharp-plain-using-simple-name'));
    it('csharp-using-static-no-namespace-prefix', ()=>runCase('csharp-using-static-no-namespace-prefix'));
    it('csharp-using-alias', ()=>runCase('csharp-using-alias'));
    it('csharp-using-alias-to-namespace', ()=>runCase('csharp-using-alias-to-namespace'));
});
describe('MATRIX — global usings (project-wide aggregation)', ()=>{
    it('csharp-global-using-same-file', ()=>runCase('csharp-global-using-same-file'));
    it('csharp-global-using-sibling-file', ()=>runCase('csharp-global-using-sibling-file'));
});
describe('MATRIX — namespace declaration shapes & enclosing-chain resolution', ()=>{
    it('csharp-file-scoped-namespace-fqn', ()=>runCase('csharp-file-scoped-namespace-fqn'));
    it('csharp-block-namespace-nested-fqn', ()=>runCase('csharp-block-namespace-nested-fqn'));
    it('csharp-deep-enclosing-chain-walk', ()=>runCase('csharp-deep-enclosing-chain-walk'));
    it('csharp-partial-name-enclosing-ns', ()=>runCase('csharp-partial-name-enclosing-ns'));
    it('csharp-fully-qualified-base-list', ()=>runCase('csharp-fully-qualified-base-list'));
});
describe('MATRIX — qualified-reference & nested-type keying', ()=>{
    it('csharp-nested-type-keying', ()=>runCase('csharp-nested-type-keying'));
});
describe('MATRIX — type-reference SYNTACTIC positions (detection)', ()=>{
    it('csharp-base-interface-list', ()=>runCase('csharp-base-interface-list'));
    it('csharp-object-creation', ()=>runCase('csharp-object-creation'));
    it('csharp-qualified-field-type', ()=>runCase('csharp-qualified-field-type'));
    it('csharp-bare-member-type', ()=>runCase('csharp-bare-member-type'));
    it('csharp-generic-type-argument', ()=>runCase('csharp-generic-type-argument'));
    it('csharp-attribute-usage', ()=>runCase('csharp-attribute-usage'));
    it('csharp-generic-constraint', ()=>runCase('csharp-generic-constraint'));
    it('csharp-typeof-operand', ()=>runCase('csharp-typeof-operand'));
    it('csharp-is-as-cast-operand', ()=>runCase('csharp-is-as-cast-operand'));
    it('csharp-tuple-array-nullable-element', ()=>runCase('csharp-tuple-array-nullable-element'));
});
describe('MATRIX — C#12 alias to closed generic / tuple / array', ()=>{
    it('csharp-alias-closed-generic', ()=>runCase('csharp-alias-closed-generic'));
});
describe('MATRIX — extern alias / alias-qualified (`::`)', ()=>{
    it('csharp-extern-alias-no-bind', ()=>runCase('csharp-extern-alias-no-bind'));
});
describe('MATRIX — SILENCE cases (must NOT bind / must silence)', ()=>{
    it('csharp-nearer-scope-hiding', ()=>runCase('csharp-nearer-scope-hiding'));
    it('csharp-sdk-simple-name-silence', ()=>runCase('csharp-sdk-simple-name-silence'));
    it('csharp-verbatim-fqn-ambiguous-silence', ()=>runCase('csharp-verbatim-fqn-ambiguous-silence'));
    it('csharp-using-subns-binds-top-level', ()=>runCase('csharp-using-subns-binds-top-level'));
    it('csharp-using-subns-no-misbind', ()=>runCase('csharp-using-subns-no-misbind'));
    it('csharp-using-import-cs0104-silence', ()=>runCase('csharp-using-import-cs0104-silence'));
    it('csharp-alias-member-codefinition-silence', ()=>runCase('csharp-alias-member-codefinition-silence'));
    it('csharp-di-reflection-extension-silence', ()=>runCase('csharp-di-reflection-extension-silence'));
    it('csharp-per-file-using-no-leak', ()=>runCase('csharp-per-file-using-no-leak'));
});
describe('MATRIX — global:: prefix stripping', ()=>{
    it('csharp-global-qualifier-strip', ()=>runCase('csharp-global-qualifier-strip'));
});
describe('MATRIX — gap-close (research-audited missing forms)', ()=>{
    it('csharp-nested-type-deep-generic', ()=>runCase('csharp-nested-type-deep-generic'));
    it('csharp-nameof-no-edge-silence', ()=>runCase('csharp-nameof-no-edge-silence'));
    it('csharp-pointer-stackalloc-element', ()=>runCase('csharp-pointer-stackalloc-element'));
    it('csharp-default-sizeof-operand', ()=>runCase('csharp-default-sizeof-operand'));
    it('csharp-primary-constructor-param-type', ()=>runCase('csharp-primary-constructor-param-type'));
    it('csharp-record-positional-param-type', ()=>runCase('csharp-record-positional-param-type'));
    it('csharp-type-pattern-binding', ()=>runCase('csharp-type-pattern-binding'));
    it('csharp-using-statement-not-import', ()=>runCase('csharp-using-statement-not-import'));
    it('csharp-target-typed-new-no-site-edge', ()=>runCase('csharp-target-typed-new-no-site-edge'));
    it('csharp-collection-expression-no-site-edge', ()=>runCase('csharp-collection-expression-no-site-edge'));
    it('csharp-extension-receiver-type', ()=>runCase('csharp-extension-receiver-type'));
});
describe('MATRIX — edge-form learning (file-local FP fix + 8 learned edges)', ()=>{
    it('csharp-file-local-type-no-cross-file', ()=>runCase('csharp-file-local-type-no-cross-file'));
    it('csharp-catch-exception-type', ()=>runCase('csharp-catch-exception-type'));
    it('csharp-generic-attribute', ()=>runCase('csharp-generic-attribute'));
    it('csharp-localfn-lambda-param-type', ()=>runCase('csharp-localfn-lambda-param-type'));
    it('csharp-using-static-target-edge', ()=>runCase('csharp-using-static-target-edge'));
    it('csharp-global-using-static-target-edge', ()=>runCase('csharp-global-using-static-target-edge'));
    it('csharp-using-alias-colon-colon', ()=>runCase('csharp-using-alias-colon-colon'));
    it('csharp-alias-anytype-embedded', ()=>runCase('csharp-alias-anytype-embedded'));
    it('csharp-global-using-alias', ()=>runCase('csharp-global-using-alias'));
});
describe('MATRIX — project-scoped global usings (.csproj)', ()=>{
    it('csharp-global-using-other-project-no-leak', ()=>runCase('csharp-global-using-other-project-no-leak'));
    it('csharp-csproj-using-item-edge', ()=>runCase('csharp-csproj-using-item-edge'));
    it('csharp-global-alias-cross-project-collision-silence', ()=>runCase('csharp-global-alias-cross-project-collision-silence'));
    it('csharp-global-alias-per-project-edge', ()=>runCase('csharp-global-alias-per-project-edge'));
});
describe('MATRIX — one type declared across several files (owner-node ambiguity)', ()=>{
    it('csharp-partial-class-multi-file-edge', ()=>runCase('csharp-partial-class-multi-file-edge'));
    it('csharp-partial-class-split-across-nodes-silence', ()=>runCase('csharp-partial-class-split-across-nodes-silence'));
    it('csharp-generic-arity-split-files-edge', ()=>runCase('csharp-generic-arity-split-files-edge'));
});
describe('MATRIX — generic base names', ()=>{
    it('csharp-generic-base-class-edge', ()=>runCase('csharp-generic-base-class-edge'));
    it('csharp-generic-interface-impl-edge', ()=>runCase('csharp-generic-interface-impl-edge'));
    it('csharp-generic-external-container-silence', ()=>runCase('csharp-generic-external-container-silence'));
});
describe('MATRIX — member access through a type name', ()=>{
    it('csharp-static-member-access-edge', ()=>runCase('csharp-static-member-access-edge'));
    it('csharp-enum-member-access-edge', ()=>runCase('csharp-enum-member-access-edge'));
    it('csharp-local-shadows-type-name-silence', ()=>runCase('csharp-local-shadows-type-name-silence'));
});
async function extensionBlockShape(code) {
    return withParsedFile('x.cs', code, (tree)=>{
        let shape = 'other';
        const visit = (n)=>{
            if (n.type === 'receiver_parameter' && n.parent?.type === 'extension_declaration') shape = 'c14';
            if (n.type === 'constructor_declaration' && n.childForFieldName('name')?.text === 'extension') {
                const params = n.childForFieldName('parameters');
                if (params?.namedChildren.some((c)=>c !== null && c.type === 'parameter')) shape = 'misparse';
            }
            for (const c of n.namedChildren)if (c !== null) visit(c);
        };
        visit(tree.rootNode);
        return shape;
    });
}
describe('MATRIX — C# 14 forms on the shipped grammar', ()=>{
    it('csharp-extension-block-receiver-edge', async ()=>{
        await runCase('csharp-extension-block-receiver-edge');
        const shape = await extensionBlockShape('static class E { extension(Order order) { public int X() => 0; } }');
        expect([
            'c14',
            'misparse'
        ]).toContain(shape);
    });
    it('csharp-null-conditional-assignment-rhs-edge', ()=>runCase('csharp-null-conditional-assignment-rhs-edge'));
});
describe('MATRIX — extension-method calls (bound at compile time)', ()=>{
    it('csharp-extension-via-owned-namespace', ()=>runCase('csharp-extension-via-owned-namespace'));
    it('csharp-extension-not-in-scope-silence', ()=>runCase('csharp-extension-not-in-scope-silence'));
});
