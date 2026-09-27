// Moved from Yggdrasil source/cli/tests/unit/relations/registry.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../helpers/expect.mjs';
import { extractorForLanguage } from '@chrisdudek/runes/relations';

describe('extractor registry', () => {
  it('returns undefined for an unknown language (data grammars too)', () => {
    expect(extractorForLanguage('json')).toBeUndefined();
    expect(extractorForLanguage('yaml')).toBeUndefined();
  });
  it('resolves the TypeScript extractor for ts/tsx/js', () => {
    expect(extractorForLanguage('typescript')).toBeDefined();
    expect(extractorForLanguage('tsx')).toBeDefined();
    expect(extractorForLanguage('javascript')).toBeDefined();
  });
  it('resolves the Kotlin extractor (symbol-table resolved)', () => {
    expect(extractorForLanguage('kotlin')).toBeDefined();
  });
  it('resolves the Rust extractor (crate module-tree resolved)', () => {
    expect(extractorForLanguage('rust')).toBeDefined();
  });
  it('resolves the C extractor for c, and C++ for cpp (quoted #include resolved)', () => {
    expect(extractorForLanguage('c')).toBeDefined();
    expect(extractorForLanguage('cpp')).toBeDefined();
  });
  it('resolves the Ruby extractor (require_relative path + constant symbol-table)', () => {
    expect(extractorForLanguage('ruby')).toBeDefined();
  });
});
