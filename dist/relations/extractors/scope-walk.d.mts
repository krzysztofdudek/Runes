import type { Node } from 'web-tree-sitter';
/**
 * Visit `root` and every node below it, depth-first in document order, handing each node the scope its ancestors made. The visitor returns `false` to skip the node's children, `undefined` to let them inherit the scope it was given, or a new scope for them. The walk moves a tree cursor (first child, next sibling, parent), each step constant time, and keeps one scope per depth, so a context an extractor needs from the ancestors (the enclosing namespaces, the type parameters in scope) is carried down once instead of being read by climbing `.parent` from every node, which costs the square of the depth.
 */
/**
 * The parent of the node a walk is visiting, valid only during that visit. Tree-sitter keeps no parent pointer: `node.parent` searches down from the root, stepping over the earlier children of every ancestor, so a visitor that asks it for each child of a node with tens of thousands of children costs the square of that number. The walk already came through the parent and hands it over in constant time.
 */
export type ParentOf = () => Node | null;
/** Visit `root` and every node below it like `walk`, handing each visit the parent of its node (see `ParentOf`). The walk did not come through the parent of `root` itself: a caller that starts many walks at the children of one wide node, and knows their parent, passes it as `parentOfRoot` instead of leaving it to `root.parent`. */
export declare function walkWithParent(root: Node, visitor: (node: Node, parent: ParentOf) => boolean | void, parentOfRoot?: ParentOf): void;
export declare function walkScoped<S>(root: Node, initial: S, visitor: (node: Node, scope: S, parent: ParentOf) => S | false | undefined, parentOfRoot?: ParentOf): void;
/**
 * The scope every node of `roots` sees, by node id: `seen(node, inherited)` is the scope the node itself is read in (the identity when absent; a scope that depends on which child of its parent a node is resolves here), and `below(node, seen)` the scope its children inherit (the same one when it returns `undefined`). `skip` names the nodes whose children are left out. A lookup is a constant-time read, however deep the node lies, which is what lets a helper that is handed a node a few levels under the one the walk is at read the same scope a climb from it would have found.
 */
export declare function indexScopes<S>(roots: readonly Node[], initial: S, below: (node: Node, seen: S, parent: ParentOf) => S | undefined, seen?: (node: Node, inherited: S) => S, skip?: (node: Node) => boolean): Map<number, S>;
