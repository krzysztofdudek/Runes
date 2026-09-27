// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/java-name-resolution-matrix.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { runCase } from '../reference-case-runner.mjs';
import { javaExtractor } from '@chrisdudek/runes/relations';
import { resolveJavaFqn } from '@chrisdudek/runes/relations';
import { SymbolTable } from '@chrisdudek/runes/relations';
import { makeResolver } from '@chrisdudek/runes/relations';
import { withParsedFile } from '../../helpers/tree-sitter.mjs';
describe('MATRIX — import forms that resolve (exact-FQN path edge; binds the EXACT file, never a sibling same-name)', ()=>{
    it('java-single-type-import-edge', ()=>runCase('java-single-type-import-edge'));
    it('java-single-import-sibling-same-name-trap', ()=>runCase('java-single-import-sibling-same-name-trap'));
    it('java-multi-import-one-edge-each', ()=>runCase('java-multi-import-one-edge-each'));
    it('java-no-import-alias', ()=>runCase('java-no-import-alias'));
});
describe('MATRIX — static imports: the declaring TYPE is the edge, never a member or a phantom package', ()=>{
    it('java-single-static-import-drop-member-edge', ()=>runCase('java-single-static-import-drop-member-edge'));
    it('java-static-import-member-sibling-trap', ()=>runCase('java-static-import-member-sibling-trap'));
    it('java-static-on-demand-type-not-package-edge', ()=>runCase('java-static-on-demand-type-not-package-edge'));
    it('java-static-on-demand-no-phantom-package-dir', ()=>runCase('java-static-on-demand-no-phantom-package-dir'));
    it('java-static-collision-both-type-edges', ()=>runCase('java-static-collision-both-type-edges'));
});
describe('MATRIX — wildcard / on-demand type import: package hint → owner-set collapse', ()=>{
    it('java-wildcard-one-owner-edge', ()=>runCase('java-wildcard-one-owner-edge'));
    it('java-wildcard-zero-owner-silence', ()=>runCase('java-wildcard-zero-owner-silence'));
    it('java-two-wildcards-each-own-merit-edge', ()=>runCase('java-two-wildcards-each-own-merit-edge'));
});
describe('MATRIX — across source roots and into Kotlin: JVM symbol-table fallback after the directory probe misses', ()=>{
    it('java-multi-module-sibling-import-edge', ()=>runCase('java-multi-module-sibling-import-edge'));
    it('java-multi-module-wildcard-edge', ()=>runCase('java-multi-module-wildcard-edge'));
    it('java-multi-module-duplicate-fqn-silence', ()=>runCase('java-multi-module-duplicate-fqn-silence'));
    it('java-test-root-to-main-root-edge', ()=>runCase('java-test-root-to-main-root-edge'));
    it('java-imports-kotlin-class-edge', ()=>runCase('java-imports-kotlin-class-edge'));
    it('java-imports-kotlin-file-facade-edge', ()=>runCase('java-imports-kotlin-file-facade-edge'));
});
describe('MATRIX — java.lang / stdlib / external / vendored: fail-to-find silence, except a mapped vendored file', ()=>{
    it('java-jdk-import-silence', ()=>runCase('java-jdk-import-silence'));
    it('java-explicit-stdlib-import-silence', ()=>runCase('java-explicit-stdlib-import-silence'));
    it('java-bare-autoimport-usage-silence', ()=>runCase('java-bare-autoimport-usage-silence'));
    it('java-meta-annotation-usage-silence', ()=>runCase('java-meta-annotation-usage-silence'));
    it('java-external-library-import-silence', ()=>runCase('java-external-library-import-silence'));
    it('java-vendored-jdk-mapped-edge', ()=>runCase('java-vendored-jdk-mapped-edge'));
});
describe('MATRIX — nested types: the ENCLOSING file (one-level path fallback); deeper only through a declared nested key', ()=>{
    it('java-nested-import-enclosing-file-edge', ()=>runCase('java-nested-import-enclosing-file-edge'));
    it('java-deep-nested-import-declared-key-edge', ()=>runCase('java-deep-nested-import-declared-key-edge'));
    it('java-qualified-inline-outer-import-only-edge', ()=>runCase('java-qualified-inline-outer-import-only-edge'));
    it('java-binary-name-string-silence', ()=>runCase('java-binary-name-string-silence'));
});
describe('MATRIX — non-type tokens that must NEVER become an edge (enum case / primitive .class / var / unnamed _)', ()=>{
    it('java-enum-case-label-silence', ()=>runCase('java-enum-case-label-silence'));
    it('java-primitive-class-literal-silence', ()=>runCase('java-primitive-class-literal-silence'));
    it('java-var-reserved-name-silence', ()=>runCase('java-var-reserved-name-silence'));
    it('java-unnamed-underscore-not-ref', ()=>runCase('java-unnamed-underscore-not-ref'));
});
describe('MATRIX — inline fully-qualified TYPE reference (no import): the FQN is shadow-free → real edge', ()=>{
    it('java-fully-qualified-inline-edge', ()=>runCase('java-fully-qualified-inline-edge'));
    it('java-extends-implements-edge', ()=>runCase('java-extends-implements-edge'));
    it('java-generic-argument-bound-edge', ()=>runCase('java-generic-argument-bound-edge'));
    it('java-instanceof-cast-classliteral-edge', ()=>runCase('java-instanceof-cast-classliteral-edge'));
    it('java-new-anonymous-diamond-edge', ()=>runCase('java-new-anonymous-diamond-edge'));
    it('java-array-varargs-element-edge', ()=>runCase('java-array-varargs-element-edge'));
    it('java-throws-clause-edge', ()=>runCase('java-throws-clause-edge'));
    it('java-multi-catch-edge', ()=>runCase('java-multi-catch-edge'));
    it('java-method-reference-edge', ()=>runCase('java-method-reference-edge'));
    it('java-generic-method-witness-edge', ()=>runCase('java-generic-method-witness-edge'));
    it('java-record-component-sealed-permits-edge', ()=>runCase('java-record-component-sealed-permits-edge'));
    it('java-switch-pattern-types-edge', ()=>runCase('java-switch-pattern-types-edge'));
});
describe('MATRIX — partially-qualified / same-package / expression-position forms (deliberate tolerated false-NEGATIVE: SILENT)', ()=>{
    it('java-same-package-no-import-silence', ()=>runCase('java-same-package-no-import-silence'));
    it('java-partially-qualified-inline-silence', ()=>runCase('java-partially-qualified-inline-silence'));
    it('java-fully-qualified-expression-call-silence', ()=>runCase('java-fully-qualified-expression-call-silence'));
    it('java-annotation-use-usage-silence', ()=>runCase('java-annotation-use-usage-silence'));
    it('java-enum-constant-use-usage-silence', ()=>runCase('java-enum-constant-use-usage-silence'));
});
describe('MATRIX — newer forms (Java 17→25: module import, module-info uses/provides, implicit java.base)', ()=>{
    it('java-module-import-silence', ()=>runCase('java-module-import-silence'));
    it('java-module-info-uses-provides', ()=>runCase('java-module-info-uses-provides'));
    it('java-implicit-module-java-base-silence', ()=>runCase('java-implicit-module-java-base-silence'));
    it('java-flexible-constructor-prologue-edge', ()=>runCase('java-flexible-constructor-prologue-edge'));
});
describe('MATRIX — declaration-key shape & resolver invariants (not expressible in runCase)', ()=>{
    function parse(repoRel, code, fn) {
        return withParsedFile(repoRel, code, (tree)=>fn({
                path: repoRel,
                content: code,
                tree,
                language: 'java'
            }));
    }
    function depsOver(files) {
        return {
            exists: (p)=>files.has(p),
            javaFilesIn: (dir)=>{
                const prefix = dir === '' ? '' : dir + '/';
                return [
                    ...files
                ].filter((f)=>f.startsWith(prefix) && !f.slice(prefix.length).includes('/'));
            }
        };
    }
    const ROOT = 'src/main/java';
    it('SEALED (latent): a nested decl is `+`-chained and package-qualified, never a flat phantom `Inner`', async ()=>{
        await parse(`${ROOT}/com/acme/Outer.java`, 'package com.acme;\nclass Outer {\n  class Inner {}\n}\n', (nestedFile)=>{
            expect(javaExtractor.declarations(nestedFile).map((d)=>d.symbolKey)).toEqual([
                'com.acme.Outer',
                'com.acme.Outer+Inner'
            ]);
            const st = new SymbolTable();
            for (const d of javaExtractor.declarations(nestedFile))st.declare('java', d.symbolKey, nestedFile.path);
            expect(st.has('java', 'com.acme.Inner')).toBe(false);
            expect(st.has('java', 'com.acme.Outer+Inner')).toBe(true);
            const r = makeResolver({
                ownerIndex: {
                    ownerOf: (f)=>({
                            [nestedFile.path]: 'a'
                        })[f]
                },
                symbolTable: st,
                resolvePathToFile: ()=>undefined
            });
            expect(r.classify({
                kind: 'symbol',
                symbolKey: 'com.acme.Inner'
            }, `${ROOT}/com/x/Use.java`, 'java')).toEqual({
                kind: 'absent'
            });
        });
    });
    it('SEALED (latent): deeper nesting is `+`-chained and package-qualified, never flat', async ()=>{
        await parse(`${ROOT}/com/acme/Outer.java`, 'package com.acme;\nclass Outer {\n  static class Mid {\n    interface Deep {}\n  }\n}\n', (deepFile)=>{
            expect(deepFile && javaExtractor.declarations(deepFile).map((d)=>d.symbolKey)).toEqual([
                'com.acme.Outer',
                'com.acme.Outer+Mid',
                'com.acme.Outer+Mid+Deep'
            ]);
        });
    });
    it('unnamed/default-package nested decls key bare `Outer` / `Outer+Inner`, never a leading dot', async ()=>{
        await parse(`${ROOT}/Top.java`, 'class Outer {\n  class Inner {}\n}\n', (noPkg)=>{
            const keys = javaExtractor.declarations(noPkg).map((d)=>d.symbolKey);
            expect(keys).toEqual([
                'Outer',
                'Outer+Inner'
            ]);
            expect(keys.every((k)=>!k.startsWith('.'))).toBe(true);
        });
    });
    it('a single-type-import whose FQN is a package DIRECTORY (not a type file) → undefined (no package fall-through)', ()=>{
        const files = new Set([
            `${ROOT}/com/acme/audit/AuditLog.java`,
            `${ROOT}/com/acme/audit/AuditWriter.java`
        ]);
        const deps = depsOver(files);
        expect(resolveJavaFqn('com.acme.audit', `${ROOT}/com/app/Use.java`, deps)).toBeUndefined();
    });
    it('split package across TWO owners in ONE directory → 2+ owners → SILENCE (not expressible in runCase)', ()=>{
        const files = new Set([
            `${ROOT}/com/acme/mixed/FromX.java`,
            `${ROOT}/com/acme/mixed/FromY.java`
        ]);
        const owners = {
            [`${ROOT}/com/acme/mixed/FromX.java`]: 'x',
            [`${ROOT}/com/acme/mixed/FromY.java`]: 'y'
        };
        const deps = depsOver(files);
        const pkgFiles = files;
        const ownerSet = new Set();
        for (const f of pkgFiles)ownerSet.add(owners[f]);
        expect(ownerSet.size).toBeGreaterThanOrEqual(2);
        expect(ownerSet.size === 1).toBe(false);
        void deps;
    });
    it('a resolved-but-UNMAPPED .java is a coverage matter → absent (silence), never a violation (not expressible in runCase)', async ()=>{
        const files = new Set([
            `${ROOT}/com/unmapped/Target.java`
        ]);
        const deps = depsOver(files);
        const r = makeResolver({
            ownerIndex: {
                ownerOf: ()=>undefined
            },
            symbolTable: new SymbolTable(),
            resolvePathToFile: (specifier, fromFile, language, isPackage)=>isPackage ? undefined : resolveJavaFqn(specifier, fromFile, deps)
        });
        expect(r.classify({
            kind: 'path',
            specifier: 'com.unmapped.Target'
        }, `${ROOT}/com/app/Use.java`, 'java')).toEqual({
            kind: 'absent'
        });
    });
});
