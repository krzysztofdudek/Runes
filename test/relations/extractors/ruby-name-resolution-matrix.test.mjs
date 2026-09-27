// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/ruby-name-resolution-matrix.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it } from '../../helpers/expect.mjs';
import { runCase } from '../reference-case-runner.mjs';
describe('MATRIX — the path-precise link (require_relative is the only file-precise static link)', ()=>{
    it('ruby-require-relative-path-edge', ()=>runCase('ruby-require-relative-path-edge'));
});
describe('MATRIX — structural constant references (superclass / mixins) resolve through the SymbolTable', ()=>{
    it('ruby-superclass-edge', ()=>runCase('ruby-superclass-edge'));
    it('ruby-mixin-include-extend-prepend-edge', ()=>runCase('ruby-mixin-include-extend-prepend-edge'));
    it('ruby-qualified-mixin-edge', ()=>runCase('ruby-qualified-mixin-edge'));
});
describe('MATRIX — value-position constant references (scope resolution / receiver / bare value / RHS)', ()=>{
    it('ruby-scope-resolution-value-edge', ()=>runCase('ruby-scope-resolution-value-edge'));
    it('ruby-qualified-call-receiver-edge', ()=>runCase('ruby-qualified-call-receiver-edge'));
    it('ruby-bare-constant-value-edge', ()=>runCase('ruby-bare-constant-value-edge'));
    it('ruby-assignment-rhs-edge', ()=>runCase('ruby-assignment-rhs-edge'));
});
describe('MATRIX — FQN keying & shadow-free positions (compact def / pattern-match / ::-rooted)', ()=>{
    it('ruby-compact-class-definition-edge', ()=>runCase('ruby-compact-class-definition-edge'));
    it('ruby-pattern-match-constant-edge', ()=>runCase('ruby-pattern-match-constant-edge'));
    it('ruby-rooted-constant-edge', ()=>runCase('ruby-rooted-constant-edge'));
});
describe('MATRIX — load-path / ambiguity / shadowing silences (the master zero-FP guards)', ()=>{
    it('ruby-plain-require-silence', ()=>runCase('ruby-plain-require-silence'));
    it('ruby-reopening-ambiguity-silence', ()=>runCase('ruby-reopening-ambiguity-silence'));
    it('ruby-lexical-shadowing-bare-silence', ()=>runCase('ruby-lexical-shadowing-bare-silence'));
    it('ruby-reopened-external-constant-silence', ()=>runCase('ruby-reopened-external-constant-silence'));
});
describe('MATRIX — dynamic / external / coverage silences (const_get/autoload, stdlib, unmapped, intra-node)', ()=>{
    it('ruby-dynamic-const-get-silence', ()=>runCase('ruby-dynamic-const-get-silence'));
    it('ruby-external-stdlib-constant-silence', ()=>runCase('ruby-external-stdlib-constant-silence'));
    it('ruby-unmapped-target-silence', ()=>runCase('ruby-unmapped-target-silence'));
    it('ruby-intra-node-silence', ()=>runCase('ruby-intra-node-silence'));
});
describe('MATRIX — lexical resolution through Module.nesting', ()=>{
    it('ruby-qualified-ref-lexical-shadow-edge', ()=>runCase('ruby-qualified-ref-lexical-shadow-edge'));
    it('ruby-qualified-ref-lexical-ambiguous-silence', ()=>runCase('ruby-qualified-ref-lexical-ambiguous-silence'));
    it('ruby-bare-constant-in-method-edge', ()=>runCase('ruby-bare-constant-in-method-edge'));
    it('ruby-zeitwerk-implicit-namespace-edge', ()=>runCase('ruby-zeitwerk-implicit-namespace-edge'));
});
describe('MATRIX — reopenings of core classes and framework namespaces stay external', ()=>{
    it('ruby-reopened-external-nested-silence', ()=>runCase('ruby-reopened-external-nested-silence'));
    it('ruby-core-class-reopening-silence', ()=>runCase('ruby-core-class-reopening-silence'));
});
describe('MATRIX — Ruby files without the .rb extension', ()=>{
    it('ruby-rake-file-edge', ()=>runCase('ruby-rake-file-edge'));
});
