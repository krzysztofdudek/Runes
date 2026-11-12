import { describe, it, expect } from '../../helpers/expect.mjs';
import { withParsedFiles } from '../../helpers/tree-sitter.mjs';
import { parseAt } from '../../helpers/internal/relations.mjs';

/** The shape of a tree, without any position: what a parse made of the text, apart from where it stood. */
const shape = (node) => node.toString().replace(/\[\d+, \d+\] - \[\d+, \d+\]/g, '');

const DAMAGED = [
  '@InternalMoshiCodegenApi',
  'public data class TargetProperty(',
  '  val propertySpec: PropertySpec,',
  '  val parameter: TargetParameter?,',
  '  val visibility: KModifier,',
  '  val jsonName: String?,',
  '  val jsonIgnore: Boolean,',
  ') {',
  '  val name: String',
  '    gt() = propertySpec.name',
  '',
  '  val type: TypeName',
  '    get() = propertySpec.type',
  '',
  '  val parameterIndex: Int',
  '    get() = parameter?.index ?: -1',
  '',
  '  val hasDefault: Boolean',
  '    get() = parameter?.hasDefault ?: true',
  '',
  '  override fun toString(): String = name',
  '}',
].join('\n');

describe('kotlin recovery parse of one declaration', () => {
  it('makes the same tree of a damaged declaration wherever the declaration stands, and gives it the rows and columns it has there', async () => {
    await withParsedFiles([{ path: 'a.kt', code: 'class A', language: 'kotlin' }], async ([file]) => {
      const parser = file.newParser();
      parser.setLanguage(file.tree.language);
      try {
        const shapes = new Set();
        for (const row of [0, 1, 2, 3, 4, 6, 9, 14, 20, 45, 100]) {
          const text = '\n'.repeat(row) + DAMAGED + '\n';
          const starts = [0];
          for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
          const tree = parseAt(parser, text, starts, row, row + DAMAGED.length);
          try {
            shapes.add(shape(tree.rootNode));
            expect(tree.rootNode.hasError).toBe(true);
            const first = tree.rootNode.descendantForPosition({ row, column: 0 });
            expect(first.text.startsWith('@InternalMoshiCodegenApi') || '@InternalMoshiCodegenApi'.startsWith(first.text)).toBe(true);
            expect(first.startPosition).toEqual({ row, column: 0 });
            expect(tree.rootNode.endPosition.row).toBeGreaterThanOrEqual(row + 21);
          } finally {
            tree.delete();
          }
        }
        expect(shapes.size).toBe(1);
      } finally {
        parser.delete();
      }
    });
  });
});
