// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/c-cpp-name-resolution-matrix.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it } from '../../helpers/expect.mjs';
import { runCase } from '../reference-case-runner.mjs';
describe('MATRIX — quoted includes that resolve (the header PATH is the edge → node by canonical join)', ()=>{
    it('cpp-quoted-subpath-include-edge', ()=>runCase('cpp-quoted-subpath-include-edge'));
    it('cpp-quoted-uppath-include-edge', ()=>runCase('cpp-quoted-uppath-include-edge'));
    it('cpp-same-basename-cross-dir-edge', ()=>runCase('cpp-same-basename-cross-dir-edge'));
    it('cpp-live-conditional-include-edge', ()=>runCase('cpp-live-conditional-include-edge'));
    it('cpp-backslash-include-edge', ()=>runCase('cpp-backslash-include-edge'));
});
describe('MATRIX — same-directory include (intra-node → SILENCE, never a cross-node edge)', ()=>{
    it('cpp-quoted-same-dir-intra-node-silence', ()=>runCase('cpp-quoted-same-dir-intra-node-silence'));
});
describe('MATRIX — angle / macro / non-existent includes (emission gate + resolver miss → SILENCE)', ()=>{
    it('cpp-angle-system-include-silence', ()=>runCase('cpp-angle-system-include-silence'));
    it('cpp-macro-operand-include-silence', ()=>runCase('cpp-macro-operand-include-silence'));
    it('cpp-nonexistent-quoted-include-silence', ()=>runCase('cpp-nonexistent-quoted-include-silence'));
});
describe('MATRIX — dead `#if 0` include (statically-known-dead → SILENCE; the sealed FP)', ()=>{
    it('cpp-dead-if-zero-include-silence', ()=>runCase('cpp-dead-if-zero-include-silence'));
    it('cpp-dead-if-zero-else-live-edge', ()=>runCase('cpp-dead-if-zero-else-live-edge'));
    it('cpp-if-false-silence', ()=>runCase('cpp-if-false-silence'));
    it('cpp-if-one-else-dead-silence', ()=>runCase('cpp-if-one-else-dead-silence'));
});
describe('MATRIX — include roots (compile database, else a conservative probe; exactly one hit)', ()=>{
    it('cpp-include-root-via-compile-db-edge', ()=>runCase('cpp-include-root-via-compile-db-edge'));
    it('cpp-in-repo-angle-include-via-I-edge', ()=>runCase('cpp-in-repo-angle-include-via-I-edge'));
    it('cpp-header-under-two-roots-silence', ()=>runCase('cpp-header-under-two-roots-silence'));
    it('cpp-compile-db-authoritative-silence', ()=>runCase('cpp-compile-db-authoritative-silence'));
    it('cpp-root-relative-google-style-edge', ()=>runCase('cpp-root-relative-google-style-edge'));
    it('cpp-include-dir-probe-edge', ()=>runCase('cpp-include-dir-probe-edge'));
    it('cpp-include-dir-probe-ambiguous-silence', ()=>runCase('cpp-include-dir-probe-ambiguous-silence'));
    it('cpp-bare-name-no-probe-silence', ()=>runCase('cpp-bare-name-no-probe-silence'));
});
describe('MATRIX — C++ file kinds (.ipp/.cppm parsed as C++; a .h with C++ siblings parsed as C++)', ()=>{
    it('cpp-ipp-source-include-edge', ()=>runCase('cpp-ipp-source-include-edge'));
    it('cpp-cppm-global-module-fragment-edge', ()=>runCase('cpp-cppm-global-module-fragment-edge'));
    it('cpp-cpp-header-named-h', ()=>runCase('cpp-cpp-header-named-h'));
});
describe('MATRIX — include escaping the repo root (path normalization rejects → SILENCE)', ()=>{
    it('cpp-include-escapes-repo-root-silence', ()=>runCase('cpp-include-escapes-repo-root-silence'));
});
describe('MATRIX — C++20 modules (name≠path + grammar-unsupported → SILENCE on every form)', ()=>{
    it('cpp-module-import-std-silence', ()=>runCase('cpp-module-import-std-silence'));
    it('cpp-export-module-decl-silence', ()=>runCase('cpp-export-module-decl-silence'));
    it('cpp-import-header-unit-silence', ()=>runCase('cpp-import-header-unit-silence'));
    it('cpp-module-partition-silence', ()=>runCase('cpp-module-partition-silence'));
});
describe('MATRIX — usage sites (call / inheritance / `ns::Type` / `using` bind by NAME → SILENCE)', ()=>{
    it('cpp-usage-site-silence', ()=>runCase('cpp-usage-site-silence'));
});
