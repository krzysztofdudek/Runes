import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withParsedFiles } from '../../helpers/tree-sitter.mjs';
import { walkScoped, indexScopes } from '../../helpers/internal/relations.mjs';

const CODE = 'mod a { mod b { use crate::x; } use crate::y; }\nuse crate::z;\n';

const withTree = (fn) => withParsedFiles([{ path: 'x.rs', code: CODE, language: 'rust' }], ([file]) => fn(file.tree.rootNode));

describe('walkScoped', () => {
  it('hands each node the scope its ancestors made', async () => {
    await withTree((root) => {
      const seen = [];
      walkScoped(root, 0, (node, depth) => {
        if (node.type === 'use_declaration') seen.push([node.text, depth]);
        return node.type === 'mod_item' ? depth + 1 : undefined;
      });
      assert.deepEqual(seen, [['use crate::x;', 2], ['use crate::y;', 1], ['use crate::z;', 0]]);
    });
  });

  it('skips the children of a node whose visitor returns false', async () => {
    await withTree((root) => {
      const uses = [];
      walkScoped(root, 0, (node) => {
        if (node.type === 'use_declaration') uses.push(node.text);
        return node.type === 'mod_item' ? false : undefined;
      });
      assert.deepEqual(uses, ['use crate::z;']);
    });
  });
});

describe('indexScopes', () => {
  it('reads the scope of any node by id, however deep it lies', async () => {
    await withTree((root) => {
      const index = indexScopes([root], 0, (node) => (node.type === 'mod_item' ? 1 : undefined));
      const scopeOf = (text) => index.get(root.descendantsOfType('use_declaration').find((n) => n.text === text).id);
      assert.equal(scopeOf('use crate::z;'), 0);
      assert.equal(scopeOf('use crate::y;'), 1);
      assert.equal(scopeOf('use crate::x;'), 1);
    });
  });

  it('lets the scope a node is read in differ from the one it inherited, and leaves out what skip names', async () => {
    await withTree((root) => {
      const index = indexScopes(
        [root],
        'outside',
        (node, own) => (node.type === 'mod_item' ? `${own}>mod` : undefined),
        (node, inherited) => (node.type === 'use_declaration' ? `${inherited}!` : inherited),
        (node) => node.type === 'mod_item' && node.childForFieldName('name').text === 'b',
      );
      const ids = (text) => root.descendantsOfType('use_declaration').find((n) => n.text === text).id;
      assert.equal(index.get(ids('use crate::z;')), 'outside!');
      assert.equal(index.get(ids('use crate::y;')), 'outside>mod!');
      assert.equal(index.has(ids('use crate::x;')), false);
    });
  });
});
