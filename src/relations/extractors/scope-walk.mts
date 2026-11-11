import type { Node } from 'web-tree-sitter';

/**
 * Visit `root` and every node below it, depth-first in document order, handing each node the scope its ancestors made. The visitor returns `false` to skip the node's children, `undefined` to let them inherit the scope it was given, or a new scope for them. The walk moves a tree cursor (first child, next sibling, parent), each step constant time, and keeps one scope per depth, so a context an extractor needs from the ancestors (the enclosing namespaces, the type parameters in scope) is carried down once instead of being read by climbing `.parent` from every node, which costs the square of the depth.
 */
/**
 * The parent of the node a walk is visiting, valid only during that visit. Tree-sitter keeps no parent pointer: `node.parent` searches down from the root, stepping over the earlier children of every ancestor, so a visitor that asks it for each child of a node with tens of thousands of children costs the square of that number. The walk already came through the parent and hands it over in constant time.
 */
export type ParentOf = () => Node | null;

/** Visit `root` and every node below it like `walk`, handing each visit the parent of its node (see `ParentOf`). The walk did not come through the parent of `root` itself: a caller that starts many walks at the children of one wide node, and knows their parent, passes it as `parentOfRoot` instead of leaving it to `root.parent`. */
export function walkWithParent(root: Node, visitor: (node: Node, parent: ParentOf) => boolean | void, parentOfRoot?: ParentOf): void {
  walkScoped<null>(root, null, (node, _scope, parent) => (visitor(node, parent) === false ? false : undefined), parentOfRoot);
}

export function walkScoped<S>(
  root: Node,
  initial: S,
  visitor: (node: Node, scope: S, parent: ParentOf) => S | false | undefined,
  parentOfRoot: ParentOf = () => root.parent,
): void {
  const cursor = root.walk();
  try {
    // scopes[d] is the scope the nodes at depth d inherit (depth 0 is `root`, which inherits `initial`).
    const scopes: S[] = [initial];
    // nodes[d] is the node the walk is at on depth d, so the parent of the node being visited is one read away.
    const nodes: Node[] = [];
    let depth = 0;
    const parent: ParentOf = () => (depth === 0 ? parentOfRoot() : nodes[depth - 1]);
    for (;;) {
      const node = cursor.currentNode;
      nodes[depth] = node;
      const result = visitor(node, scopes[depth], parent);
      if (result !== false && cursor.gotoFirstChild()) {
        scopes[depth + 1] = result === undefined ? scopes[depth] : result;
        depth++;
        continue;
      }
      while (depth > 0 && !cursor.gotoNextSibling()) {
        cursor.gotoParent();
        depth--;
      }
      if (depth === 0) return;
    }
  } finally {
    cursor.delete();
  }
}

/**
 * The scope every node of `roots` sees, by node id: `seen(node, inherited)` is the scope the node itself is read in (the identity when absent; a scope that depends on which child of its parent a node is resolves here), and `below(node, seen)` the scope its children inherit (the same one when it returns `undefined`). `skip` names the nodes whose children are left out. A lookup is a constant-time read, however deep the node lies, which is what lets a helper that is handed a node a few levels under the one the walk is at read the same scope a climb from it would have found.
 */
export function indexScopes<S>(
  roots: readonly Node[],
  initial: S,
  below: (node: Node, seen: S) => S | undefined,
  seen?: (node: Node, inherited: S) => S,
  skip?: (node: Node) => boolean,
): Map<number, S> {
  const index = new Map<number, S>();
  for (const root of roots) {
    walkScoped<S>(root, initial, (node, inherited) => {
      const own = seen === undefined ? inherited : seen(node, inherited);
      index.set(node.id, own);
      if (skip?.(node) === true) return false;
      return below(node, own) ?? (own === inherited ? undefined : own);
    });
  }
  return index;
}
