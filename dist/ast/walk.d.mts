import type { Node } from 'web-tree-sitter';
/**
 * Visit `node` and every node below it, depth-first in document order; a visitor that returns `false` skips the children of the node it was given. The traversal moves a tree cursor (first child, next sibling, parent), each step constant time, so the walk is linear in the number of nodes: `node.child(i)` counts from the first child on every call, which made a node with tens of thousands of direct children (the ERROR node a binary or foreign file parses into) cost the square of that number.
 */
export declare function walk(node: Node, visitor: (node: Node) => boolean | void): void;
export declare function closest(node: Node, types: string | string[]): Node | null;
