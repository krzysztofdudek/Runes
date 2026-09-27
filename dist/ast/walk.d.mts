import type { Node } from 'web-tree-sitter';
export declare function walk(node: Node, visitor: (node: Node) => boolean | void): void;
export declare function closest(node: Node, types: string | string[]): Node | null;
