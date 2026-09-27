// Moved from Yggdrasil source/cli/tests/unit/relations/extractor-rev.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect } from '../helpers/expect.mjs';
import { extractorForLanguage } from '@chrisdudek/runes/relations';

describe('extractor rev', () => {
  it('every extractor declares an integer rev', () => {
    for (const lang of ['typescript','python','go','java','php','kotlin','rust','c','cpp','csharp','ruby']) {
      const e = extractorForLanguage(lang);
      expect(Number.isInteger(e.rev)).toBe(true);
    }
  });
  it('seeds preserve current history', () => {
    expect(extractorForLanguage('java').rev).toBe(3);
    expect(extractorForLanguage('csharp').rev).toBe(3);
    expect(extractorForLanguage('typescript').rev).toBe(3); // 3: every type-only reference and a module augmentation give an edge; 2: bare specifiers, new URL(), ERROR-region recovery
  });
});
