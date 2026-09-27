// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin-name-resolution-matrix.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { runCase } from '../reference-case-runner.mjs';
import { kotlinExtractor } from '@chrisdudek/runes/relations';
import { SymbolTable } from '@chrisdudek/runes/relations';
import { makeResolver } from '@chrisdudek/runes/relations';
import { withParsedFile } from '../../helpers/tree-sitter.mjs';
describe('MATRIX — import forms that resolve (FQN edge; binds the EXACT FQN, never a sibling same-name)', ()=>{
    it('kotlin-plain-import-fqn-edge', ()=>runCase('kotlin-plain-import-fqn-edge'));
    it('kotlin-plain-import-sibling-same-name-trap', ()=>runCase('kotlin-plain-import-sibling-same-name-trap'));
    it('kotlin-multi-import-one-edge-each', ()=>runCase('kotlin-multi-import-one-edge-each'));
    it('kotlin-package-header-keying-edge', ()=>runCase('kotlin-package-header-keying-edge'));
    it('kotlin-root-package-bare-keys-edge', ()=>runCase('kotlin-root-package-bare-keys-edge'));
    it('kotlin-top-level-fun-import-exact-fqn', ()=>runCase('kotlin-top-level-fun-import-exact-fqn'));
    it('kotlin-top-level-fun-sibling-same-name-trap', ()=>runCase('kotlin-top-level-fun-sibling-same-name-trap'));
});
describe('MATRIX — alias import (`import a.b.C as D`): target is the FQN before `as`; `D` is never a key)', ()=>{
    it('kotlin-alias-import-fqn-before-as', ()=>runCase('kotlin-alias-import-fqn-before-as'));
    it('kotlin-alias-import-name-not-a-target', ()=>runCase('kotlin-alias-import-name-not-a-target'));
});
describe('MATRIX — enum / companion / object member imports (resolve at the declared-TYPE boundary, else SILENCE)', ()=>{
    it('kotlin-enum-member-import-verbatim-silence', ()=>runCase('kotlin-enum-member-import-verbatim-silence'));
    it('kotlin-enum-entry-import-not-indexed-silence', ()=>runCase('kotlin-enum-entry-import-not-indexed-silence'));
    it('kotlin-member-chain-not-subpackage-silence', ()=>runCase('kotlin-member-chain-not-subpackage-silence'));
    it('kotlin-companion-member-import-plus-split', ()=>runCase('kotlin-companion-member-import-plus-split'));
    it('kotlin-object-member-import-plus-split', ()=>runCase('kotlin-object-member-import-plus-split'));
});
describe('MATRIX — star import (`import a.b.*`): package owner-set collapse, like Java (one owner → edge; 0 or 2+ → SILENCE; never expanded)', ()=>{
    it('kotlin-wildcard-one-owner-edge', ()=>runCase('kotlin-wildcard-one-owner-edge'));
    it('kotlin-wildcard-split-owner-silence', ()=>runCase('kotlin-wildcard-split-owner-silence'));
});
describe('MATRIX — default / implicit stdlib (Form 3): unimported names → SILENCE (the collision trap)', ()=>{
    it('kotlin-implicit-stdlib-no-import-silence', ()=>runCase('kotlin-implicit-stdlib-no-import-silence'));
    it('kotlin-stdlib-collision-project-result-silence', ()=>runCase('kotlin-stdlib-collision-project-result-silence'));
    it('kotlin-explicit-stdlib-import-absent-silence', ()=>runCase('kotlin-explicit-stdlib-import-absent-silence'));
});
describe('MATRIX — nested / inner types (Form 4): split at a declared-TYPE boundary, NEVER deeper packages', ()=>{
    it('kotlin-nested-flat-key-fp-sealed', ()=>runCase('kotlin-nested-flat-key-fp-sealed'));
    it('kotlin-nested-import-plus-split-edge', ()=>runCase('kotlin-nested-import-plus-split-edge'));
    it('kotlin-deep-nested-import-plus-split-edge', ()=>runCase('kotlin-deep-nested-import-plus-split-edge'));
    it('kotlin-nested-vs-subpackage-ambiguous-silence', ()=>runCase('kotlin-nested-vs-subpackage-ambiguous-silence'));
    it('kotlin-nested-plus-key-not-dollar-edge', ()=>runCase('kotlin-nested-plus-key-not-dollar-edge'));
});
describe('MATRIX — inline fully-qualified TYPE reference (no import): the FQN is shadow-free → real edge', ()=>{
    it('kotlin-supertype-list-edge', ()=>runCase('kotlin-supertype-list-edge'));
    it('kotlin-generic-argument-where-edge', ()=>runCase('kotlin-generic-argument-where-edge'));
    it('kotlin-is-as-test-cast-edge', ()=>runCase('kotlin-is-as-test-cast-edge'));
    it('kotlin-param-return-property-edge', ()=>runCase('kotlin-param-return-property-edge'));
    it('kotlin-annotation-use-edge', ()=>runCase('kotlin-annotation-use-edge'));
    it('kotlin-annotation-use-site-target-edge', ()=>runCase('kotlin-annotation-use-site-target-edge'));
    it('kotlin-context-sensitive-resolution-edge', ()=>runCase('kotlin-context-sensitive-resolution-edge'));
    it('kotlin-typealias-rhs-edge', ()=>runCase('kotlin-typealias-rhs-edge'));
    it('kotlin-extension-receiver-edge', ()=>runCase('kotlin-extension-receiver-edge'));
    it('kotlin-delegation-by-edge', ()=>runCase('kotlin-delegation-by-edge'));
    it('kotlin-when-subject-smartcast-edge', ()=>runCase('kotlin-when-subject-smartcast-edge'));
    it('kotlin-pair-to-tuple-edge', ()=>runCase('kotlin-pair-to-tuple-edge'));
    it('kotlin-nullable-array-vararg-edge', ()=>runCase('kotlin-nullable-array-vararg-edge'));
});
describe('MATRIX — expression-position / grammar-limited silences (deliberate tolerated false-NEGATIVE: SILENT, not a bug)', ()=>{
    it('kotlin-class-literal-callable-ref-usage-silence', ()=>runCase('kotlin-class-literal-callable-ref-usage-silence'));
    it('kotlin-constructor-call-usage-silence', ()=>runCase('kotlin-constructor-call-usage-silence'));
    it('kotlin-fully-qualified-inline-ref-usage-silence', ()=>runCase('kotlin-fully-qualified-inline-ref-usage-silence'));
    it('kotlin-bare-top-level-call-only-import-edge', ()=>runCase('kotlin-bare-top-level-call-only-import-edge'));
});
describe('MATRIX — JVM artifacts (Form 8): a Kotlin import binds the Kotlin FQN, never the `<File>Kt` / `@file:JvmName` facade', ()=>{
    it('kotlin-jvmname-no-facade-key-edge', ()=>runCase('kotlin-jvmname-no-facade-key-edge'));
    it('kotlin-multiple-top-level-decls-one-key-each', ()=>runCase('kotlin-multiple-top-level-decls-one-key-each'));
});
describe('MATRIX — newer forms (Kotlin 2.0→2.4): nested type alias declaration-keying edge', ()=>{
    it('kotlin-nested-type-alias-plus-keyed', ()=>runCase('kotlin-nested-type-alias-plus-keyed'));
});
describe('MATRIX — parse recovery: declarations after unknown syntax survive; a parse gap never flips an ambiguity', ()=>{
    it('kotlin-when-guard-subsequent-decls-edge', ()=>runCase('kotlin-when-guard-subsequent-decls-edge'));
    it('kotlin-multidollar-subsequent-decls-edge', ()=>runCase('kotlin-multidollar-subsequent-decls-edge'));
    it('kotlin-context-parameter-subsequent-decls-edge', ()=>runCase('kotlin-context-parameter-subsequent-decls-edge'));
    it('kotlin-error-decl-no-ambiguity-flip-silence', ()=>runCase('kotlin-error-decl-no-ambiguity-flip-silence'));
    it('kotlin-unrecoverable-decl-fails-closed-silence', ()=>runCase('kotlin-unrecoverable-decl-fails-closed-silence'));
});
describe('MATRIX — keying and source layout: locals are not keys; KMP source sets; same package needs an import', ()=>{
    it('kotlin-local-val-not-a-top-level-key', ()=>runCase('kotlin-local-val-not-a-top-level-key'));
    it('kotlin-kmp-source-set-import-edge', ()=>runCase('kotlin-kmp-source-set-import-edge'));
    it('kotlin-same-package-cross-node-silence', ()=>runCase('kotlin-same-package-cross-node-silence'));
});
describe('MATRIX — one JVM namespace: Kotlin imports Java declarations', ()=>{
    it('kotlin-imports-java-class-edge', ()=>runCase('kotlin-imports-java-class-edge'));
});
describe('MATRIX — ambiguity collapses to SILENCE (never an arbitrary edge)', ()=>{
    it('kotlin-same-fqn-two-files-ambiguous-silence', ()=>runCase('kotlin-same-fqn-two-files-ambiguous-silence'));
    it('kotlin-expect-actual-same-node-edge', ()=>runCase('kotlin-expect-actual-same-node-edge'));
    it('kotlin-toplevel-overload-multi-file-edge', ()=>runCase('kotlin-toplevel-overload-multi-file-edge'));
    it('UNMAPPED in-graph file → absent (coverage matter, never a violation; not expressible in runCase)', async ()=>{
        const code = 'package com.acme\nclass Order\n';
        const decls = await withParsedFile('src/a/Order.kt', code, (tree)=>kotlinExtractor.declarations({
                path: 'src/a/Order.kt',
                content: code,
                tree,
                language: 'kotlin'
            }));
        const st = new SymbolTable();
        for (const d of decls)st.declare('kotlin', d.symbolKey, 'src/a/Order.kt');
        const r = makeResolver({
            ownerIndex: {
                ownerOf: ()=>undefined
            },
            symbolTable: st,
            resolvePathToFile: ()=>undefined
        });
        expect(r.classify({
            kind: 'symbol',
            symbolKey: 'com.acme.Order'
        }, 'src/c/Use.kt', 'kotlin')).toEqual({
            kind: 'absent'
        });
    });
});
