// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/c-name-resolution-matrix.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it } from '../../helpers/expect.mjs';
import { runCase } from '../reference-case-runner.mjs';
describe('MATRIX — C includes that resolve', ()=>{
    it('c-header-parses-as-c-routing-edge', ()=>runCase('c-header-parses-as-c-routing-edge'));
    it('c-extern-c-wrapper-edge', ()=>runCase('c-extern-c-wrapper-edge'));
});
describe('MATRIX — C dead branches and non-includes (SILENCE)', ()=>{
    it('c-if-paren-zero-silence', ()=>runCase('c-if-paren-zero-silence'));
    it('c-has-include-elif-zero-silence', ()=>runCase('c-has-include-elif-zero-silence'));
    it('c-elifdef-dead-branch', ()=>runCase('c-elifdef-dead-branch'));
    it('c-embed-silence', ()=>runCase('c-embed-silence'));
});
