import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withParsedFiles } from '../../helpers/tree-sitter.mjs';
import { walkScoped, indexScopes } from '../../helpers/internal/relations.mjs';
import * as relations from '../../helpers/internal/relations.mjs';

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

  it('hands each visit the parent of its node, the one `node.parent` names', async () => {
    await withTree((root) => {
      let visits = 0;
      walkScoped(root, 0, (node, _scope, parent) => {
        visits++;
        assert.equal(parent()?.id, node.parent?.id, node.type);
        assert.equal(parent() === null, node.parent === null, node.type);
        return undefined;
      });
      assert.equal(visits, root.descendantCount);
    });
  });

  it('started below the root, reads the parent of the node it was given from the tree unless the caller names it', async () => {
    await withTree((root) => {
      const mod = root.namedChild(0);
      const seen = [];
      walkScoped(mod, 0, (node, _scope, parent) => {
        if (node.id === mod.id) seen.push(parent()?.type);
        return false;
      });
      walkScoped(mod, 0, (node, _scope, parent) => { seen.push(parent()); return false; }, () => null);
      assert.deepEqual(seen, ['source_file', null]);
    });
  });
});

describe('walkWithParent', () => {
  it('visits what walk visits, each node with its parent, and a false return skips the children', async () => {
    await withTree((root) => {
      const seen = [];
      relations.walkWithParent(root, (node, parent) => {
        if (node.type === 'use_declaration') seen.push([node.text, parent()?.type]);
        return node.type !== 'mod_item' || node.childForFieldName('name')?.text !== 'b';
      });
      assert.deepEqual(seen, [['use crate::y;', 'declaration_list'], ['use crate::z;', 'source_file']]);
    });
  });

  it('takes the parent of the node it starts at from the caller when given one', async () => {
    await withTree((root) => {
      const mod = root.namedChild(0);
      const parents = [];
      relations.walkWithParent(mod, (_node, parent) => { parents.push(parent()?.type); return false; });
      relations.walkWithParent(mod, (_node, parent) => { parents.push(parent()?.type); return false; }, () => root.namedChild(1));
      assert.deepEqual(parents, ['source_file', 'use_declaration']);
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
