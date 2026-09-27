// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/python-name-resolution-matrix.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it } from '../../helpers/expect.mjs';
import { runCase } from '../reference-case-runner.mjs';
describe('MATRIX — absolute import forms (module-path = file-path; the operand is the edge)', ()=>{
    it('python-plain-import-edge', ()=>runCase('python-plain-import-edge'));
    it('python-aliased-import-edge', ()=>runCase('python-aliased-import-edge'));
    it('python-multi-name-import-edge', ()=>runCase('python-multi-name-import-edge'));
});
describe('MATRIX — from-import (module + longest-match submodule candidate, never a phantom)', ()=>{
    it('python-from-import-absolute-edge', ()=>runCase('python-from-import-absolute-edge'));
    it('python-from-import-submodule-edge', ()=>runCase('python-from-import-submodule-edge'));
});
describe('MATRIX — relative imports (directory-pinned climb by dot-count)', ()=>{
    it('python-relative-sibling-import-edge', ()=>runCase('python-relative-sibling-import-edge'));
    it('python-relative-parent-import-edge', ()=>runCase('python-relative-parent-import-edge'));
});
describe('MATRIX — star / placement variants (whole-tree walk catches every placement)', ()=>{
    it('python-star-import-edge', ()=>runCase('python-star-import-edge'));
    it('python-conditional-import-edge', ()=>runCase('python-conditional-import-edge'));
    it('python-function-local-import-edge', ()=>runCase('python-function-local-import-edge'));
    it('python-type-checking-import-edge', ()=>runCase('python-type-checking-import-edge'));
});
describe('MATRIX — namespace packages and re-exports (submodule edge / package-object silence)', ()=>{
    it('python-namespace-submodule-edge', ()=>runCase('python-namespace-submodule-edge'));
    it('python-reexport-chain-edge', ()=>runCase('python-reexport-chain-edge'));
    it('python-namespace-package-object-silence', ()=>runCase('python-namespace-package-object-silence'));
});
describe('MATRIX — dynamic / future / external (resolution miss or non-import → SILENCE)', ()=>{
    it('python-future-import-silence', ()=>runCase('python-future-import-silence'));
    it('python-dynamic-importlib-silence', ()=>runCase('python-dynamic-importlib-silence'));
    it('python-stdlib-import-silence', ()=>runCase('python-stdlib-import-silence'));
    it('python-external-import-silence', ()=>runCase('python-external-import-silence'));
    it('python-all-export-silence', ()=>runCase('python-all-export-silence'));
});
describe('MATRIX — coverage / granularity / escape silences (zero false positives)', ()=>{
    it('python-unmapped-module-silence', ()=>runCase('python-unmapped-module-silence'));
    it('python-intra-node-import-silence', ()=>runCase('python-intra-node-import-silence'));
    it('python-relative-escape-silence', ()=>runCase('python-relative-escape-silence'));
});
describe('MATRIX — source roots (ancestor packages are not roots; discovered project roots)', ()=>{
    it('python-stdlib-shadowed-by-ancestor-module-silence', ()=>runCase('python-stdlib-shadowed-by-ancestor-module-silence'));
    it('python-src-layout-tests-edge', ()=>runCase('python-src-layout-tests-edge'));
    it('python-workspace-member-edge', ()=>runCase('python-workspace-member-edge'));
    it('python-workspace-stdlib-name-silence', ()=>runCase('python-workspace-stdlib-name-silence'));
});
describe('MATRIX — newer import syntax and report shape', ()=>{
    it('python-lazy-import-edge', ()=>runCase('python-lazy-import-edge'));
    it('python-from-import-single-report', ()=>runCase('python-from-import-single-report'));
});
