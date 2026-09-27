// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/java-resolve.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { resolveJavaFqn, resolveJavaPackageFiles } from '@chrisdudek/runes/relations';
const files = new Set([
    'src/main/java/com/acme/payments/PaymentService.java',
    'src/main/java/com/acme/audit/AuditLog.java',
    'src/main/java/com/acme/audit/AuditWriter.java',
    'src/main/java/com/foo/Outer.java',
    'src/main/java/com/acme/app/OrderHandler.java'
]);
const deps = {
    exists: (p)=>files.has(p),
    javaFilesIn: (dir)=>{
        const prefix = dir === '' ? '' : dir + '/';
        return [
            ...files
        ].filter((f)=>f.startsWith(prefix) && !f.slice(prefix.length).includes('/'));
    }
};
const FROM = 'src/main/java/com/acme/app/OrderHandler.java';
describe('resolveJavaFqn — type FQN → file', ()=>{
    it('resolves a type FQN via an ancestor source root', ()=>{
        expect(resolveJavaFqn('com.acme.payments.PaymentService', FROM, deps)).toBe('src/main/java/com/acme/payments/PaymentService.java');
    });
    it('resolves a nested-type FQN to the enclosing type file (longest-match parent)', ()=>{
        expect(resolveJavaFqn('com.foo.Outer.Inner', FROM, deps)).toBe('src/main/java/com/foo/Outer.java');
    });
    it('returns undefined for a JDK stdlib type (no mapped file)', ()=>{
        expect(resolveJavaFqn('java.util.List', FROM, deps)).toBeUndefined();
        expect(resolveJavaFqn('javax.annotation.Nullable', FROM, deps)).toBeUndefined();
    });
    it('returns undefined for an external-library type (no mapped file)', ()=>{
        expect(resolveJavaFqn('com.google.common.collect.ImmutableList', FROM, deps)).toBeUndefined();
    });
    it('returns undefined for a single bare segment that maps to nothing', ()=>{
        expect(resolveJavaFqn('Nope', FROM, deps)).toBeUndefined();
    });
    it('returns undefined for an empty / dots-only specifier (no segments)', ()=>{
        expect(resolveJavaFqn('', FROM, deps)).toBeUndefined();
        expect(resolveJavaFqn('.', FROM, deps)).toBeUndefined();
    });
    it('resolves from a file at the repo root (dirname is "." → root ancestor)', ()=>{
        const rootFiles = new Set([
            'com/foo/Bar.java'
        ]);
        const rootDeps = {
            exists: (p)=>rootFiles.has(p),
            javaFilesIn: ()=>[]
        };
        expect(resolveJavaFqn('com.foo.Bar', 'Main.java', rootDeps)).toBe('com/foo/Bar.java');
    });
});
describe('resolveJavaPackageFiles — wildcard package FQN → candidate file set', ()=>{
    it('returns ALL .java files in the resolved package directory', ()=>{
        expect(resolveJavaPackageFiles('com.acme.audit', FROM, deps).sort()).toEqual([
            'src/main/java/com/acme/audit/AuditLog.java',
            'src/main/java/com/acme/audit/AuditWriter.java'
        ]);
    });
    it('returns an empty set for a package with no source files anywhere', ()=>{
        expect(resolveJavaPackageFiles('com.acme.empty', FROM, deps)).toEqual([]);
    });
    it('returns the single file for a one-file package', ()=>{
        expect(resolveJavaPackageFiles('com.acme.payments', FROM, deps)).toEqual([
            'src/main/java/com/acme/payments/PaymentService.java'
        ]);
    });
});
describe('resolveJavaFqn — single-type import does NOT fall through to a package', ()=>{
    it('returns undefined for a type FQN whose path is a DIRECTORY of .java files', ()=>{
        expect(resolveJavaFqn('com.acme.audit', FROM, deps)).toBeUndefined();
    });
    it('still resolves a real type FQN to its file', ()=>{
        expect(resolveJavaFqn('com.acme.payments.PaymentService', FROM, deps)).toBe('src/main/java/com/acme/payments/PaymentService.java');
    });
});
describe('resolveJavaFqn / resolveJavaPackageFiles — exclusion-aware ancestor-root walk', ()=>{
    const nearFile = 'src/main/java/com/a/Zzz.java';
    const farFile = 'src/com/a/Zzz.java';
    const shadowFiles = new Set([
        nearFile,
        farFile
    ]);
    function shadowDeps(isExcluded) {
        return {
            exists: (p)=>shadowFiles.has(p),
            javaFilesIn: (dir)=>{
                const prefix = dir === '' ? '' : dir + '/';
                return [
                    ...shadowFiles
                ].filter((f)=>f.startsWith(prefix) && !f.slice(prefix.length).includes('/'));
            },
            isExcluded
        };
    }
    it('control: with nothing excluded, the nearer ancestor root wins a precise type import', ()=>{
        expect(resolveJavaFqn('com.a.Zzz', FROM, shadowDeps())).toBe(nearFile);
    });
    it('excluding the nearer root file lets a precise type import fall through to the farther, still-live root', ()=>{
        const isExcluded = (p)=>p === nearFile;
        expect(resolveJavaFqn('com.a.Zzz', FROM, shadowDeps(isExcluded))).toBe(farFile);
    });
    it('excluding the farther root file leaves the nearer precise-import resolution unaffected', ()=>{
        const isExcluded = (p)=>p === farFile;
        expect(resolveJavaFqn('com.a.Zzz', FROM, shadowDeps(isExcluded))).toBe(nearFile);
    });
    it('excluding both root files leaves a precise type import unresolved', ()=>{
        const isExcluded = ()=>true;
        expect(resolveJavaFqn('com.a.Zzz', FROM, shadowDeps(isExcluded))).toBeUndefined();
    });
    it('control: with nothing excluded, a wildcard import commits to the nearer root directory', ()=>{
        expect(resolveJavaPackageFiles('com.a', FROM, shadowDeps())).toEqual([
            nearFile
        ]);
    });
    it('excluding the nearer root\'s only file lets a wildcard import walk up to the farther root', ()=>{
        const isExcluded = (p)=>p === nearFile;
        expect(resolveJavaPackageFiles('com.a', FROM, shadowDeps(isExcluded))).toEqual([
            farFile
        ]);
    });
    it('excluding one of several files in the nearer root\'s directory returns the survivors, without walking up', ()=>{
        const twoFiles = new Set([
            nearFile,
            'src/main/java/com/a/Yyy.java',
            farFile
        ]);
        const deps2 = {
            exists: (p)=>twoFiles.has(p),
            javaFilesIn: (dir)=>{
                const prefix = dir === '' ? '' : dir + '/';
                return [
                    ...twoFiles
                ].filter((f)=>f.startsWith(prefix) && !f.slice(prefix.length).includes('/'));
            },
            isExcluded: (p)=>p === nearFile
        };
        expect(resolveJavaPackageFiles('com.a', FROM, deps2)).toEqual([
            'src/main/java/com/a/Yyy.java'
        ]);
    });
});
describe('resolveJavaFqn — excluded nested-type candidate falls through within the SAME root', ()=>{
    const typePath = 'src/main/java/com/foo/Outer/Inner.java';
    const parentTypePath = 'src/main/java/com/foo/Outer.java';
    function nestedDeps(isExcluded) {
        const nestedFiles = new Set([
            typePath,
            parentTypePath
        ]);
        return {
            exists: (p)=>nestedFiles.has(p),
            javaFilesIn: ()=>[],
            isExcluded
        };
    }
    it('control: with nothing excluded, the more specific typePath candidate wins over parentTypePath', ()=>{
        expect(resolveJavaFqn('com.foo.Outer.Inner', FROM, nestedDeps())).toBe(typePath);
    });
    it('excluding the typePath candidate falls through to the live parentTypePath candidate AT THE SAME ROOT — not silence, and not a farther root', ()=>{
        const isExcluded = (p)=>p === typePath;
        expect(resolveJavaFqn('com.foo.Outer.Inner', FROM, nestedDeps(isExcluded))).toBe(parentTypePath);
    });
    it('excluding the parentTypePath candidate leaves the typePath resolution unaffected', ()=>{
        const isExcluded = (p)=>p === parentTypePath;
        expect(resolveJavaFqn('com.foo.Outer.Inner', FROM, nestedDeps(isExcluded))).toBe(typePath);
    });
    it('excluding both leaves the nested-type FQN unresolved', ()=>{
        const isExcluded = ()=>true;
        expect(resolveJavaFqn('com.foo.Outer.Inner', FROM, nestedDeps(isExcluded))).toBeUndefined();
    });
});
