// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/javascript-name-resolution-matrix.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it } from '../../helpers/expect.mjs';
import { runCase } from '../reference-case-runner.mjs';
describe('MATRIX — JavaScript sources', ()=>{
    it('javascript-cjs-require-edge', ()=>runCase('javascript-cjs-require-edge'));
    it('javascript-export-from-with-attributes-edge', ()=>runCase('javascript-export-from-with-attributes-edge'));
    it('javascript-jsdoc-import-silence', ()=>runCase('javascript-jsdoc-import-silence'));
    it('javascript-jsx-in-js-edge', ()=>runCase('javascript-jsx-in-js-edge'));
    it('javascript-mjs-import-edge', ()=>runCase('javascript-mjs-import-edge'));
});
