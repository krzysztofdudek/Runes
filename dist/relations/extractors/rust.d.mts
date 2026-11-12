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
 * Every module a Rust file declares without a body: each `mod x;` that is an item of the file itself or of inline modules nested in it, and each one in a branch of a `cfg_if!` that stands among those items, as the path of its names from the file's own module (`x`, `outer/x`), with `r#` stripped. Whatever stands in front of the `mod` (a `cfg`, a `path` attribute, an attribute macro) is not read: the list says which names are modules with a file of their own, not where the file is.
 *
 * `known` says that the list holds every such module of the file. It is false where a `mod` may exist that the tree does not show: in a file the grammar could not parse to the end, in one whose head holds an inner attribute that is not one of the compiler's, and in one that invokes, among those items or in a `cfg_if!` branch, a macro other than the item macros Runes reads (`ITEM_MACROS`, `cfg_if!`), since a macro can expand to a `mod` or include a file that holds one.
 */
export declare function declaredModules(root: Node): {
    declared: Array<{
        path: string;
        line: number;
    }>;
    known: boolean;
};
/**
 * The files a Rust file loads through a `path` attribute on a `mod` without a body that is an item of the file itself, outside every inline module, and the same for a `mod` inside an inline module that carries no `path` attribute of its own, with the names of the inline modules in front of the path (`inline` is true for those, whose directory the reader of the table places): the attribute's string, read as a path with `/` between its parts and normalized (`./imp/../platform/linux.rs` → `platform/linux.rs`; a leading `..` stays). Rust reads it relative to the directory of the file that writes it, and treats the file it names as a mod-rs file, whose own `mod x;` lies beside it. Left out: a `mod` inside an inline module, where the path starts from another directory; one in a macro's tokens; a `cfg_attr` that applies a `path`; and a path that is absolute, empty, or written with an escape or a `\`.
 */
export declare function pathModules(root: Node, directory?: readonly string[]): Array<{
    path: string;
    line: number;
    inline: boolean;
}>;
/**
 * Every name the top level of a Rust file binds as an item, read from its parse tree (the `source_file`'s own children, never anything below an item's body): the name of each item it defines (struct, enum, union, trait, type, fn, const, static, mod, `macro_rules!`; for a function with `#[proc_macro_derive(Name, …)]` in front of it the derive `Name` as well as the function), of each item an `extern` block there declares, each name a top-level `use` brings in (the last segment of a path, each member of a group, the alias of an `as`, the module a `self` member names; never a glob), and the items of the known item macros (`ITEM_MACROS`, and `cfg_if!`). A crate bound with `extern crate` is no item a `use` path names and is left out; so is `_`. `r#` is stripped. A part of the file the grammar cannot parse yields nothing.
 */
export declare function topLevelItemNames(root: Node): Array<{
    name: string;
    line: number;
}>;
/** The crates the top level of a Rust file binds with `extern crate`, read from its parse tree: `name` is the name the declaration binds in the file's module (the alias of `extern crate a as name;`, else the crate) and `crate` the crate it stands for, both with `r#` stripped; `crate` is undefined for `extern crate self as name;`, which names the crate that writes it. `extern crate a as _;` binds none. */
export declare function topLevelExternCrates(root: Node): Array<{
    name: string;
    crate: string | undefined;
    line: number;
}>;
/** The paths of the globs among the top-level `use` declarations of a Rust file, as written and with `r#` stripped (`types` for `pub use types::*;`, `self::a::b` for `use self::a::{b::*, C};`): the modules whose names each glob brings into the file's own module. A `use` that starts with `::` names a crate and is left out. `conditional` is true when a `cfg` in front of the `use`, or a `cfg_attr` there that applies one, may remove it; whether its predicate holds is not read. */
export declare function topLevelGlobs(root: Node): Array<{
    path: string;
    line: number;
    conditional: boolean;
}>;
/**
 * The file-backed modules a `cfg_if!` body declares: each `mod x;` in a braced branch, in a `cfg_if!` nested in one, and in an inline `mod y { … }` written there, which adds its name in front (`names`, `r#` stripped: `x`, or `y`, `x`). `at` is the `mod` keyword. `moved` is true when a `path` attribute stands in front of the `mod` or of an inline module around it, behind a visibility, comments or other attributes: the file is then not where the names put it. Every branch is listed, since each is the crate's on some target.
 */
export declare function cfgIfModules(body: Node): Array<{
    names: string[];
    at: Node;
    moved: boolean;
}>;
/** The `extern crate` declarations of a `cfg_if!` body: each in a braced branch or in a `cfg_if!` nested in one, never one inside an inline `mod` or a function body written there, as `topLevelExternCrates` gives them (the name bound, the crate, `r#` stripped, none for `as _` or `self` alone), with `at`, the `extern` token. Every branch is listed, since each is the module's on some target. */
export declare function cfgIfExternCrates(body: Node): Array<{
    name: string;
    crate: string | undefined;
    line: number;
    at: Node;
}>;
export declare const rustExtractor: DependencyExtractor;
