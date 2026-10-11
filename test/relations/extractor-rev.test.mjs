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
    expect(extractorForLanguage('csharp').rev).toBe(6); // 6: an unnamed qualified, `global::` or generic element beside a named one in a tuple type argument gives its edge, `F(x < Limits.Max, y > z)` reads its member-access operands, and a type parameter scopes to its own declaration (a sibling class's `Entity.Create()` gives its edge); 5: a bare name that equals a type parameter in scope names that type parameter, not a type of the repository, `stackalloc T[n]` names its element type, `global::X` binds only a type of the global namespace, the element types of a named tuple type argument give an edge, and a generic attribute behind a qualifier (`[A.Gen<T>]`) and an attribute after a using alias (`[S::Foo]`) give theirs; 4: the type arguments of a generic method call, `new T[n]`, a typed `foreach` and a declaration expression give an edge, and a file of top-level statements declares `Program`
    expect(extractorForLanguage('typescript').rev).toBe(3); // 3: every type-only reference and a module augmentation give an edge; 2: bare specifiers, new URL(), ERROR-region recovery
    expect(extractorForLanguage('kotlin').rev).toBe(5); // 5: a nested class over a next-line constructor without val or var keeps its members; 4: annotated top-level declarations the grammar misreads as script statements are declared, and a nested class with its primary constructor on the next line keeps its members
  });
});
