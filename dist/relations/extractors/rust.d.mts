import type { Node } from 'web-tree-sitter';
import type { DependencyExtractor } from './types.mjs';
/**
 * Every name the top level of a Rust file binds as an item, read from its parse tree (the `source_file`'s own children, never anything below an item's body): the name of each item it defines (struct, enum, union, trait, type, fn, const, static, mod, `macro_rules!`), of each item an `extern` block there declares, each name a top-level `use` brings in (the last segment of a path, each member of a group, the alias of an `as`, the module a `self` member names; never a glob), and the items of the known item macros (`ITEM_MACROS`, and `cfg_if!`). A crate bound with `extern crate` is no item a `use` path names and is left out; so is `_`. `r#` is stripped. A part of the file the grammar cannot parse yields nothing.
 */
export declare function topLevelItemNames(root: Node): Array<{
    name: string;
    line: number;
}>;
export declare const rustExtractor: DependencyExtractor;
