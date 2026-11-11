import type { Node } from 'web-tree-sitter';
import type { DependencyExtractor } from './types.mjs';
/**
 * The modules a Rust file places in files of their own by their names: each `mod x;` (no body) that is an item of the file itself, or of inline modules nested in it, as the path of the names from the file's own module (`x`, `outer/x`), with `r#` stripped. Rust compiles the file that path names beside the declaring file (`x.rs` or `x/mod.rs`) into every crate that compiles the declaring file, unless a `cfg` removes the declaration.
 *
 * `conditional` is true when a `cfg` may remove the declaration: a `cfg` in front of the `mod` or of an inline module around it, or a `cfg`, or a `cfg_attr` that applies one, at the head of such an inline module or of the file. Whether the predicate holds is not read (`cfg(any())` never does), so a conditional declaration says the file may be compiled, never that it is.
 *
 * Only what the tree proves is listed, so a module missing here is not known to be absent. Left out: a `mod` with an attribute in front of it other than the compiler's own inert ones (a `path`, a `cfg_attr`, an attribute macro), or inside an inline module with one; every `mod` of a file or an inline module whose head holds an inner attribute that is not one of the compiler's or that names a `path`; a `mod` inside a function body, a block or a macro's tokens; and every `mod` of a file the grammar could not parse to the end, where the nesting itself is a guess.
 */
export declare function plainModuleFiles(root: Node): Array<{
    path: string;
    line: number;
    conditional: boolean;
}>;
/**
 * Every name the top level of a Rust file binds as an item, read from its parse tree (the `source_file`'s own children, never anything below an item's body): the name of each item it defines (struct, enum, union, trait, type, fn, const, static, mod, `macro_rules!`), of each item an `extern` block there declares, each name a top-level `use` brings in (the last segment of a path, each member of a group, the alias of an `as`, the module a `self` member names; never a glob), and the items of the known item macros (`ITEM_MACROS`, and `cfg_if!`). A crate bound with `extern crate` is no item a `use` path names and is left out; so is `_`. `r#` is stripped. A part of the file the grammar cannot parse yields nothing.
 */
export declare function topLevelItemNames(root: Node): Array<{
    name: string;
    line: number;
}>;
export declare const rustExtractor: DependencyExtractor;
