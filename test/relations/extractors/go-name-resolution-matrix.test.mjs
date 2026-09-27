// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/go-name-resolution-matrix.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it } from '../../helpers/expect.mjs';
import { runCase } from '../reference-case-runner.mjs';
describe('MATRIX — import forms that resolve (the import PATH is the edge → directory by full path)', ()=>{
    it('go-single-import-edge', ()=>runCase('go-single-import-edge'));
    it('go-grouped-import-edge', ()=>runCase('go-grouped-import-edge'));
    it('go-raw-string-import-edge', ()=>runCase('go-raw-string-import-edge'));
});
describe('MATRIX — local-binding forms (alias / blank / dot): the binding is irrelevant, the PATH is the edge', ()=>{
    it('go-aliased-import-edge', ()=>runCase('go-aliased-import-edge'));
    it('go-blank-import-edge', ()=>runCase('go-blank-import-edge'));
    it('go-dot-import-edge', ()=>runCase('go-dot-import-edge'));
});
describe('MATRIX — stdlib / external (no module-prefix match → SILENCE, the most important FP guard)', ()=>{
    it('go-stdlib-import-silence', ()=>runCase('go-stdlib-import-silence'));
    it('go-external-module-import-silence', ()=>runCase('go-external-module-import-silence'));
});
describe('MATRIX — unmodeled rewrite (replace): out-of-module → SILENCE, never a guessed edge', ()=>{
    it('go-replace-directive-silence', ()=>runCase('go-replace-directive-silence'));
});
describe('MATRIX — multi-module repositories (nested module, parent module, go.work member, quoted module path)', ()=>{
    it('go-go-work-workspace-edge', ()=>runCase('go-go-work-workspace-edge'));
    it('go-nested-module-parent-import-edge', ()=>runCase('go-nested-module-parent-import-edge'));
    it('go-nested-submodule-edge', ()=>runCase('go-nested-submodule-edge'));
    it('go-quoted-module-path-edge', ()=>runCase('go-quoted-module-path-edge'));
    it('go-major-version-module-edge', ()=>runCase('go-major-version-module-edge'));
});
describe('MATRIX — ordinary package shapes (internal/, external _test package) and the cgo pseudo-package', ()=>{
    it('go-internal-package-edge', ()=>runCase('go-internal-package-edge'));
    it('go-external-test-package-edge', ()=>runCase('go-external-test-package-edge'));
    it('go-cgo-import-silence', ()=>runCase('go-cgo-import-silence'));
});
describe('MATRIX — coverage / granularity silences (uncovered package, intra-package reference)', ()=>{
    it('go-unmapped-package-silence', ()=>runCase('go-unmapped-package-silence'));
    it('go-intra-package-silence', ()=>runCase('go-intra-package-silence'));
});
