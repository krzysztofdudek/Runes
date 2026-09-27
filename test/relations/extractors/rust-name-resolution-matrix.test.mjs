// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/rust-name-resolution-matrix.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { runCase } from '../reference-case-runner.mjs';
import { resolveRustPath } from '@chrisdudek/runes/relations';
describe('MATRIX — crate-relative use (the `::`-path IS the edge; resolves through the module tree)', ()=>{
    it('rust-use-single-crate-relative-edge', ()=>runCase('rust-use-single-crate-relative-edge'));
    it('rust-use-renamed-alias-dropped-edge', ()=>runCase('rust-use-renamed-alias-dropped-edge'));
    it('rust-use-grouped-common-prefix-edge', ()=>runCase('rust-use-grouped-common-prefix-edge'));
    it('rust-use-glob-prefix-module-edge', ()=>runCase('rust-use-glob-prefix-module-edge'));
    it('rust-pub-use-reexport-edge', ()=>runCase('rust-pub-use-reexport-edge'));
    it('rust-use-grouped-crate-root-edge', ()=>runCase('rust-use-grouped-crate-root-edge'));
    it('rust-use-grouped-nested-subpath-edge', ()=>runCase('rust-use-grouped-nested-subpath-edge'));
    it('rust-use-crate-root-item-edge', ()=>runCase('rust-use-crate-root-item-edge'));
    it('rust-raw-identifier-module-edge', ()=>runCase('rust-raw-identifier-module-edge'));
});
describe('MATRIX — Cargo targets and packages (bin / test crate roots, in-repo path dependencies, extern crate)', ()=>{
    it('rust-bin-target-crate-root-edge', ()=>runCase('rust-bin-target-crate-root-edge'));
    it('rust-integration-test-mod-common-edge', ()=>runCase('rust-integration-test-mod-common-edge'));
    it('rust-workspace-path-dependency-edge', ()=>runCase('rust-workspace-path-dependency-edge'));
    it('rust-extern-crate-alias-edge', ()=>runCase('rust-extern-crate-alias-edge'));
});
describe('MATRIX — inline modules are a level of the module tree (super/self and mod decls inside `mod x { … }`)', ()=>{
    it('rust-inline-mod-tests-super-glob-silence', ()=>runCase('rust-inline-mod-tests-super-glob-silence'));
    it('rust-mod-decl-inside-inline-mod-edge', ()=>runCase('rust-mod-decl-inside-inline-mod-edge'));
});
describe('MATRIX — mod declarations & inline crate-relative paths (file-backed mod + crate/self/super inline → EDGE)', ()=>{
    it('rust-mod-decl-file-backed-edge', ()=>runCase('rust-mod-decl-file-backed-edge'));
    it('rust-inline-crate-type-position-edge', ()=>runCase('rust-inline-crate-type-position-edge'));
    it('rust-inline-crate-expression-position-edge', ()=>runCase('rust-inline-crate-expression-position-edge'));
    it('rust-inline-self-super-relative-edge', ()=>runCase('rust-inline-self-super-relative-edge'));
});
describe('MATRIX — silence forms (#[path] override / inline mod body / bare root / external crate / macro token tree)', ()=>{
    it('rust-mod-path-attribute-override-silence', ()=>runCase('rust-mod-path-attribute-override-silence'));
    it('rust-inline-mod-body-silence', ()=>runCase('rust-inline-mod-body-silence'));
    it('rust-inline-bare-root-silence', ()=>runCase('rust-inline-bare-root-silence'));
    it('rust-use-external-crate-silence', ()=>runCase('rust-use-external-crate-silence'));
    it('rust-macro-invocation-path-silence', ()=>runCase('rust-macro-invocation-path-silence'));
    it('rust-macro-export-silence', ()=>runCase('rust-macro-export-silence'));
});
const KNOWN = new Set([
    'src/lib.rs',
    'src/a.rs',
    'src/a/b.rs',
    'src/a/b/deep.rs',
    'src/a/sib.rs',
    'src/a/x.rs',
    'src/x.rs',
    'src/sib.rs',
    'src/serde.rs'
]);
const baseDeps = {
    crateRootFor: ()=>({
            srcDir: 'src',
            crateName: 'mycrate'
        })
};
const exists = (p)=>KNOWN.has(p);
const R = (specifier, fromFile, deps = baseDeps)=>resolveRustPath(specifier, fromFile, exists, deps);
describe('RESOLVER — same-LEAF different-module-path traps (the FULL path pins the file)', ()=>{
    it('`crate::x::Y` → `src/x.rs`, NEVER the nested `src/a/x.rs` (leaf `x` collision)', ()=>{
        expect(R('crate::x::Y', 'src/lib.rs')).toBe('src/x.rs');
    });
    it('`crate::a::x::Y` → `src/a/x.rs`, NEVER the top-level `src/x.rs` (twin)', ()=>{
        expect(R('crate::a::x::Y', 'src/lib.rs')).toBe('src/a/x.rs');
    });
    it('the crate own NAME root `mycrate::a::b::C` is treated like `crate` → `src/a/b.rs`', ()=>{
        expect(R('mycrate::a::b::C', 'src/lib.rs')).toBe('src/a/b.rs');
    });
    it('the external-crate guard is NOT a file probe: `serde::Foo` → SILENCE even though `src/serde.rs` EXISTS', ()=>{
        expect(R('serde::Foo', 'src/lib.rs')).toBeUndefined();
    });
    it('the in-repo twin IS reachable — only via `crate::`: `crate::serde::Foo` → `src/serde.rs`', ()=>{
        expect(R('crate::serde::Foo', 'src/lib.rs')).toBe('src/serde.rs');
    });
});
describe('RESOLVER — super:: / self:: relative climbs (mis-climb / over-climb → SILENCE)', ()=>{
    it('`super::sib::Y` from `src/a/b.rs` → `src/a/sib.rs` (one climb to module a, sibling sib)', ()=>{
        expect(R('super::sib::Y', 'src/a/b.rs')).toBe('src/a/sib.rs');
    });
    it('`super::super::sib::Y` from `src/a/b.rs` → top-level `src/sib.rs` (two climbs select the twin)', ()=>{
        expect(R('super::super::sib::Y', 'src/a/b.rs')).toBe('src/sib.rs');
    });
    it('`self::deep::Z` from `src/a/b.rs` → `src/a/b/deep.rs` (submodule of the own module)', ()=>{
        expect(R('self::deep::Z', 'src/a/b.rs')).toBe('src/a/b/deep.rs');
    });
    it('over-climb guard: `super::super::super::X` from `src/a/b.rs` → SILENCE (above the crate root)', ()=>{
        expect(R('super::super::super::X', 'src/a/b.rs')).toBeUndefined();
    });
    it('root-module climb guard: `super::X` from `src/lib.rs` → SILENCE (crate root has no parent module)', ()=>{
        expect(R('super::X', 'src/lib.rs')).toBeUndefined();
    });
});
describe('RESOLVER — no-crate-root / malformed (no Cargo.toml ancestor or unrenderable path → SILENCE)', ()=>{
    it('a crate path with NO Cargo.toml ancestor → SILENCE (no module-tree root to anchor)', ()=>{
        const noCrate = {
            crateRootFor: ()=>undefined
        };
        expect(R('crate::a::b::C', 'src/lib.rs', noCrate)).toBeUndefined();
    });
    it('a `super::` path with NO Cargo.toml ancestor → SILENCE (relative resolution still needs src/)', ()=>{
        const noCrate = {
            crateRootFor: ()=>undefined
        };
        expect(R('super::sib::Y', 'src/a/b.rs', noCrate)).toBeUndefined();
    });
    it('an empty specifier → SILENCE (no path segments to resolve)', ()=>{
        expect(R('', 'src/lib.rs')).toBeUndefined();
    });
});
