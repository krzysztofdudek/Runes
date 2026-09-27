// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/php-name-resolution-matrix.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it } from '../../helpers/expect.mjs';
import { runCase } from '../reference-case-runner.mjs';
describe('MATRIX — `use` import forms that resolve (FQN edge; alias is local, never the target)', ()=>{
    it('php-plain-use-fqn-edge', ()=>runCase('php-plain-use-fqn-edge'));
    it('php-aliased-use-fqn-edge', ()=>runCase('php-aliased-use-fqn-edge'));
    it('php-leading-backslash-use-edge', ()=>runCase('php-leading-backslash-use-edge'));
    it('php-grouped-use-one-edge-each', ()=>runCase('php-grouped-use-one-edge-each'));
    it('php-grouped-aliased-clause-edge', ()=>runCase('php-grouped-aliased-clause-edge'));
    it('php-nested-group-base-edge', ()=>runCase('php-nested-group-base-edge'));
    it('php-namespace-alias-use-edge', ()=>runCase('php-namespace-alias-use-edge'));
    it('php-multi-clause-use-edge', ()=>runCase('php-multi-clause-use-edge'));
    it('php-import-sibling-same-name-trap', ()=>runCase('php-import-sibling-same-name-trap'));
    it('php-enum-import-edge', ()=>runCase('php-enum-import-edge'));
});
describe('MATRIX — function / const imports (no class edge; sibling class clause still emits)', ()=>{
    it('php-use-function-no-edge', ()=>runCase('php-use-function-no-edge'));
    it('php-use-const-no-edge', ()=>runCase('php-use-const-no-edge'));
    it('php-grouped-use-function-no-edge', ()=>runCase('php-grouped-use-function-no-edge'));
    it('php-grouped-mixed-function-class-edge', ()=>runCase('php-grouped-mixed-function-class-edge'));
    it('php-grouped-mixed-const-class-edge', ()=>runCase('php-grouped-mixed-const-class-edge'));
    it('php-grouped-mixed-position-independent-edge', ()=>runCase('php-grouped-mixed-position-independent-edge'));
});
describe('MATRIX — namespace-relative inline forms (PHP name resolution; no file → SILENT)', ()=>{
    it('php-new-relative-silence', ()=>runCase('php-new-relative-silence'));
    it('php-extends-implements-relative-silence', ()=>runCase('php-extends-implements-relative-silence'));
    it('php-trait-use-relative-silence', ()=>runCase('php-trait-use-relative-silence'));
    it('php-param-return-property-relative-silence', ()=>runCase('php-param-return-property-relative-silence'));
    it('php-instanceof-relative-silence', ()=>runCase('php-instanceof-relative-silence'));
    it('php-class-const-relative-silence', ()=>runCase('php-class-const-relative-silence'));
    it('php-static-call-relative-silence', ()=>runCase('php-static-call-relative-silence'));
    it('php-catch-relative-silence', ()=>runCase('php-catch-relative-silence'));
    it('php-attribute-relative-silence', ()=>runCase('php-attribute-relative-silence'));
    it('php-namespace-relative-keyword-silence', ()=>runCase('php-namespace-relative-keyword-silence'));
    it('php-enum-case-relative-silence', ()=>runCase('php-enum-case-relative-silence'));
    it('php-qualified-usage-via-alias-edge', ()=>runCase('php-qualified-usage-via-alias-edge'));
    it('php-namespace-alias-qualified-usage', ()=>runCase('php-namespace-alias-qualified-usage'));
    it('php-namespace-relative-qualified-edge', ()=>runCase('php-namespace-relative-qualified-edge'));
});
describe('MATRIX — leading-backslash inline (absolute, shadow-free) → EDGE', ()=>{
    it('php-inline-backslash-new-edge', ()=>runCase('php-inline-backslash-new-edge'));
    it('php-inline-backslash-extends-implements-edge', ()=>runCase('php-inline-backslash-extends-implements-edge'));
    it('php-inline-backslash-trait-use-edge', ()=>runCase('php-inline-backslash-trait-use-edge'));
    it('php-inline-backslash-param-return-property-edge', ()=>runCase('php-inline-backslash-param-return-property-edge'));
    it('php-inline-backslash-instanceof-edge', ()=>runCase('php-inline-backslash-instanceof-edge'));
    it('php-inline-backslash-class-const-edge', ()=>runCase('php-inline-backslash-class-const-edge'));
    it('php-inline-backslash-static-call-edge', ()=>runCase('php-inline-backslash-static-call-edge'));
    it('php-inline-backslash-multi-catch-edge', ()=>runCase('php-inline-backslash-multi-catch-edge'));
    it('php-inline-backslash-attribute-edge', ()=>runCase('php-inline-backslash-attribute-edge'));
    it('php-inline-backslash-function-call-silence', ()=>runCase('php-inline-backslash-function-call-silence'));
    it('php-inline-backslash-bare-constant-silence', ()=>runCase('php-inline-backslash-bare-constant-silence'));
});
describe('MATRIX — the trap cases T1–T6 (prove no mis-binding: SILENCE or import-bound target)', ()=>{
    it('php-no-global-fallback-silence', ()=>runCase('php-no-global-fallback-silence'));
    it('php-arrayobject-trap-silence', ()=>runCase('php-arrayobject-trap-silence'));
    it('php-trap-alias-matching-current-ns-edge', ()=>runCase('php-trap-alias-matching-current-ns-edge'));
    it('php-trap-qualified-first-segment-clash-edge', ()=>runCase('php-trap-qualified-first-segment-clash-edge'));
    it('php-trap-trait-use-relative-import-edge', ()=>runCase('php-trap-trait-use-relative-import-edge'));
});
describe('MATRIX — dynamic forms (false-positive sources: MUST be SILENT)', ()=>{
    it('php-dynamic-new-var-silence', ()=>runCase('php-dynamic-new-var-silence'));
    it('php-dynamic-var-static-call-silence', ()=>runCase('php-dynamic-var-static-call-silence'));
    it('php-dynamic-new-expr-silence', ()=>runCase('php-dynamic-new-expr-silence'));
    it('php-dynamic-obj-class-silence', ()=>runCase('php-dynamic-obj-class-silence'));
    it('php-dynamic-class-alias-silence', ()=>runCase('php-dynamic-class-alias-silence'));
    it('php-dynamic-namespace-concat-silence', ()=>runCase('php-dynamic-namespace-concat-silence'));
});
describe('MATRIX — PSR-4 resolution (longest prefix; unique-root → resolved; multi-root → SILENCE)', ()=>{
    it('php-psr4-single-root-edge', ()=>runCase('php-psr4-single-root-edge'));
    it('php-psr4-longest-prefix-wins-edge', ()=>runCase('php-psr4-longest-prefix-wins-edge'));
    it('php-psr4-vendor-no-prefix-silence', ()=>runCase('php-psr4-vendor-no-prefix-silence'));
    it('php-psr4-two-roots-one-hit-edge', ()=>runCase('php-psr4-two-roots-one-hit-edge'));
    it('php-psr4-two-roots-both-hit-ambiguous-silence', ()=>runCase('php-psr4-two-roots-both-hit-ambiguous-silence'));
    it('php-psr4-extra-prefix-single-hit-edge', ()=>runCase('php-psr4-extra-prefix-single-hit-edge'));
});
describe('MATRIX — monorepo composer maps, empty prefix, PSR-0 (exactly one hit)', ()=>{
    it('php-psr4-monorepo-sibling-package-edge', ()=>runCase('php-psr4-monorepo-sibling-package-edge'));
    it('php-psr4-root-map-shadowed-edge', ()=>runCase('php-psr4-root-map-shadowed-edge'));
    it('php-psr4-cross-package-duplicate-silence', ()=>runCase('php-psr4-cross-package-duplicate-silence'));
    it('php-psr4-empty-prefix-edge', ()=>runCase('php-psr4-empty-prefix-edge'));
    it('php-psr0-edge', ()=>runCase('php-psr0-edge'));
});
describe('MATRIX — require/include (file-relative via __DIR__/dirname → EDGE; runtime-resolved → SILENCE)', ()=>{
    it('php-require-dir-relative-edge', ()=>runCase('php-require-dir-relative-edge'));
    it('php-require-bare-path-silence', ()=>runCase('php-require-bare-path-silence'));
});
describe('MATRIX — grammar gaps that must not cost an edge', ()=>{
    it('php-84-asymmetric-promotion-edge', ()=>runCase('php-84-asymmetric-promotion-edge'));
});
