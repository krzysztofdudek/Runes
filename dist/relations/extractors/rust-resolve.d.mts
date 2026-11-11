/**
 * Resolve a Rust `::`-path specifier to a repo-relative POSIX `.rs` source file, or
 * undefined.
 *
 * The specifier is what the extractor emits: a `::`-joined path rooted at `crate`,
 * `super`, `self`, or a bare crate-name segment (`crate::orders::Order`,
 * `super::util::X`, `self::y`, `std::collections::HashMap`).
 *
 * `exists(repoRelPosix)` reports whether a candidate file exists in the resolution
 * universe (disk at --approve time; a fixed known-set in unit tests). The crate root
 * is discovered through `crateRootFor` (resolve-path.ts), which walks up from the importing file to the
 * nearest `Cargo.toml` and returns that crate's `src/` directory (and, when known,
 * the crate's own package name so a path rooted at the crate's own name is treated
 * like `crate`).
 *
 * CARGO TARGETS: a package holds several crates. `src/lib.rs` and `src/main.rs` root the
 * library and the default binary (module tree under `src/`); every `src/bin/<name>.rs`,
 * `src/bin/<name>/main.rs`, `tests/<name>.rs`, `examples/<name>.rs` and `benches/<name>.rs` roots a crate of its
 * own, whose `crate::` is that target's tree, not the library's, and so does the `path` of a `[[bin]]`, `[[test]]`, `[[example]]` or `[[bench]]` table, wherever it lies. A crate ROOT file resolves
 * `mod x;` beside itself (like `mod.rs`); `crateRootFor` says which target a file belongs to
 * and whether it is that target's root. The package's own name always means the library.
 *
 * EDITION: in edition 2015 (also what Cargo assumes when `[package]` gives no edition) a `use` path
 * is relative to the crate root, so `use a::b;` names the module `a` the root declares
 * (`crateRelativeUses`), before any path dependency of that name; a crate is in reach there only through an
 * `extern crate` a root writes, the package's own library included. From edition 2018 on the same path names an external crate.
 *
 * CRATE-ROOT ITEMS: the module file of `crate` itself is the crate root file, so
 * `crate::Error` for an `enum Error` defined in `src/lib.rs` binds `src/lib.rs`. Because
 * `#[macro_export]` macros also land in the crate-root namespace while being defined
 * elsewhere, the root file is bound for a named item only when its top level binds that
 * name (`rootDeclares`, read from the file's parse tree); otherwise the path stays silent.
 *
 * A root also binds a name it does not write when one of its top-level globs brings it in
 * (`mod types; pub use types::*;`): the name is then an item of the module the glob names, a
 * module of the root's own tree. Two globs that both bring the name in make it ambiguous,
 * which Rust refuses where the name is used, so the path stays silent.
 *
 * EXTERN CRATE NAMES: `extern crate a as b;` binds `b` in the module or block that writes it.
 * Written in the crate root it makes `b` name the crate `a` in every module of that crate
 * (`externCrateFor`). Written anywhere else it binds `b` in that scope only; the extractor,
 * which sees the scopes, emits a `use` path there that starts with `b` as
 * `extern::a::as::b::…`, and the declaration itself as `extern::a`. A `self::` or `super::` path
 * whose next name the file of the module it reaches binds that way names the crate too. `extern` is a keyword, so
 * no path of the source starts with it. An edition 2015 `use` path is relative to the crate
 * root, so there only the root's declarations count.
 *
 * NAMES IN SCOPE: from edition 2018 a `use` path may start with a name in scope of the module
 * that writes it: a module it declares, or a name another `use` there brought in. Such a name
 * is found before a crate of the same name. The extractor, which sees the scopes, emits such a
 * path as `use::<n>::<the n segments the name stands for>::<the path as written>`
 * (`use::2::self::shapes::shapes::Circle` for `mod shapes; use shapes::Circle;`). `use` is a
 * keyword, so no path of the source starts with it. In edition 2015 the path is read as written.
 *
 * PATH DEPENDENCIES: a bare first segment that names an in-repo path dependency of the
 * importing crate (`core-lib = { path = "../core-lib" }`, or `{ workspace = true }` inherited
 * from `[workspace.dependencies]`) resolves inside that crate's library tree. Registry
 * crates are never path dependencies, so they stay external. In edition 2015 a `use`
 * path cannot start with a crate of the extern prelude: the first segment is what the first
 * root that binds it makes of it, a crate bound with `extern crate` or a module or an item of
 * that root, and a dependency no root binds stays silent. Only an `extern crate` declaration
 * names its crate directly.
 *
 * DECLARED MODULES: a file is a module only when a `mod` item declares it. A file whose name
 * fits a path (`src/util/parse.rs` for `crate::util::parse`) is bound as a module when a file
 * of a module above it declares it (`moduleDeclared`), and passed over when the files above it
 * are known to declare no such module: the name is then an item of the module above, and that
 * module's file is bound. Where neither is known the file is bound as before, unless it is the
 * root file of a Cargo target, which is a crate of its own (`src/bin/serve.rs` for
 * `crate::serve` written in `src/bin/server.rs`). Without `moduleDeclared` (no table of the
 * pass) no file's modules are known and every fitting file is bound, as in 1.0.
 *
 * PATH-LOADED FILES: a file that a `#[path]` attribute on a `mod` outside inline modules loads
 * (`pathLoaders`) is treated by Rust as a mod-rs file, whatever its name: its own `mod x;` and
 * `self::x` lie beside it (`src/platform/epoll/mod.rs` for `src/platform/linux.rs`), not
 * under a directory named after it. Its `super` is the module of the file that loads it,
 * whatever their places on disk: `super::x` there is `self::x` read from that file. Two files
 * that load it make its parent a module that cannot be told, so such a path names nothing.
 *
 * RESOLUTION MISS → undefined. This fail-to-silence is the single most important
 * false-positive guard:
 *   - A path rooted at an EXTERNAL crate (std, serde, tokio — any first segment that
 *     is NOT `crate`/`super`/`self`, NOT the current crate's own name and NOT an in-repo
 *     path dependency) → undefined.
 *   - A mis-climbed `super::`, a path whose module file is not present, a
 *     macro-generated or build-script path → undefined.
 * Nothing outside the repository's own crates is ever flagged.
 */
/** One crate's module tree: the directory `crate::` resolves under and the crate-root files
 *  (probe order) that hold the items of the crate root module. */
export interface RustCrateTree {
    srcDir: string;
    rootFiles: string[];
}
export interface RustCrateRoot {
    /** Module-tree root directory of the target the importing file belongs to. */
    srcDir: string;
    /** The package's crate name (`[lib].name`, else `[package].name`, hyphens → underscores). */
    crateName: string | undefined;
    /** Crate-root files of that target, in probe order. Absent → no crate-root item lookup. */
    rootFiles?: string[];
    /** True when the importing file IS its target's crate root (resolves `mod x;` beside
     *  itself). Absent → the legacy basename rule (`lib.rs` / `main.rs`). */
    fileIsRoot?: boolean;
    /** The package's library tree, which the crate's own name addresses from any target.
     *  Absent → the same tree as `srcDir` / `rootFiles`. Null → the package has no library, so its crate name addresses nothing. */
    lib?: RustCrateTree | null;
    /** True when the package is edition 2015 (the edition Cargo assumes when `[package]` gives none): a `use` path with a bare leading identifier is relative to the crate root there, as `crate::` is. Absent or false → such a path names an external crate. */
    crateRelativeUses?: boolean;
    /** True when the file lies in a directory of `src/bin/` that is no crate of its own, and its crate cannot be told: no binary there is known to declare it, or two or more certainly compile it (each through a chain of plain `mod` declarations no `cfg` can remove) and each reads `crate::` and `super::` as its own root. Binaries that declare it only under a `cfg` stand after the one that certainly compiles it in `rootFiles`, as the roots of one tree do. A path rooted at `crate`, one that climbs with `super` to the crate root, and the edition 2015 relative `use` then name nothing; the package's own crate name and its path dependencies still resolve. Absent or false → the file's crate is told. */
    unrooted?: boolean;
    /** True when every one of `rootFiles` is a crate that certainly compiles the file: each declares it through a chain of plain `mod` declarations that no `cfg` can remove. `crate::` then means a different root in each, so a root item binds none of them. Absent or false → `rootFiles` are in probe order and the first existing one that holds a name binds it; a root known to compile the file stands first, and one that may compile it under a `cfg` after it. */
    rootsShared?: boolean;
    /** The crate-root files whose top-level items an edition 2015 `use` path of the file may name, in probe order: the roots known to compile the file when all of them are edition 2015, and the roots Cargo infers for its tree when those are. Absent → `rootFiles`. */
    crateRelativeRoots?: string[];
}
export interface RustResolveDeps {
    /**
     * For the importing file, find its Cargo package by walking up to the nearest ancestor
     * containing a `Cargo.toml`, then work out which Cargo target the file belongs to (see
     * CARGO TARGETS above). Returns undefined when no Cargo.toml ancestor is found.
     */
    crateRootFor(fromFile: string): RustCrateRoot | undefined;
    /** The library tree of the in-repo path dependency the importing crate calls `name`, or
     *  undefined when `name` is not such a dependency. Absent → no dependency resolution. */
    dependencyFor?(fromFile: string, name: string): RustCrateTree | undefined;
    /** Does the top level of crate-root file `rootFile` bind `name`: an item the file defines there, a name a top-level `use` brings in by name or through the one glob whose module declares it, an item of a known item macro, or a crate bound there with `extern crate`? Never a name defined inside an inline `mod`, a function body or an initializer, or one that stands only in a string or a comment. With `asItem` a crate bound with `extern crate` does not count: an edition 2015 `use` path names items. Absent → yes. */
    rootDeclares?(rootFile: string, name: string, asItem?: boolean): boolean;
    /** The library tree of the crate that the top level of `file` binds as `name` with `extern crate` (`extern crate a as name;`, or `extern crate name;`), when that crate is an in-repo path dependency of the package of `fromFile`, or that package's own library. Undefined when `file` binds no such name there or the crate is not in the repository. Absent → no name is known to be bound that way. Its presence also says that what a crate root binds is known, which the edition 2015 rule for a path dependency needs. */
    externCrateFor?(fromFile: string, file: string, name: string): RustCrateTree | undefined;
    /** Does `file` declare, without a body, the module at `modulePath` below its own module (`x`, or `outer/x` through its inline module `outer`)? True when it does; false when every module the file declares is known and this is none of them; undefined when that is not known (the file is not in the pass's table, did not parse to the end, or invokes a macro that could declare one). Absent → never known. */
    moduleDeclared?(file: string, modulePath: string): boolean | undefined;
    /** The files that load `file` through a `path` attribute on a `mod` they write outside inline modules; empty when none is known to. Such a file owns its directory as a `mod.rs` does, and its parent module is the module of the file that loads it. Absent → no file is known to be loaded that way. */
    pathLoaders?(file: string): string[];
}
export declare function resolveRustPath(specifier: string, fromFile: string, exists: (repoRelPosix: string) => boolean, deps: RustResolveDeps): string | undefined;
/** The symbol key under which the Rust extractor declares `name` for a file whose top level binds it as an item (an item the file defines there, one an `extern` block or a known item macro defines there, or a name a top-level `use` brings in). It is what an edition 2015 `use` path from the crate root can name in that file when the file is the crate root; the key's `item:` prefix keeps it apart from the extractor's other declarations and can never be a Rust identifier. */
export declare function rustTopLevelItemKey(name: string): string;
/** The symbol key under which the Rust extractor declares `name` for a file whose top level binds it with `extern crate` (the alias of `extern crate a as name;`, else the crate of `extern crate name;`). Such a name is a name of the file's module that a `crate::` path, or a path into a dependency, can go through (`pub extern crate inner as name;` in a facade), and no item an edition 2015 `use` path names. The `extern:` prefix can never be a Rust identifier. */
export declare function rustExternNameKey(name: string): string;
/** The symbol key under which the Rust extractor declares, for a file whose top level writes `extern crate <crate> as <name>;` or `extern crate <name>;`, that `name` stands for the crate `crate` there (both as written in code, with `r#` stripped). A table answers only whether a key is declared, so the resolver asks it for each crate the importing package can name. */
export declare function rustExternBindingKey(name: string, crate: string): string;
/** The symbol key under which the Rust extractor declares, for a file, a module that the file places in a file of its own by name alone: a `mod x;` with no `path` attribute and no macro around it. `modulePath` is the module's names from the declaring file's own module, joined by `/` (`x`, or `outer/x` for one inside the inline module `outer`). A declaration that a `cfg` may remove (`conditional`) has a key of its own, `modfile?:<path>`, so it is never taken for one that always holds, `modfile:<path>`. Neither prefix can be a Rust identifier. */
export declare function rustModuleFileKey(modulePath: string, conditional?: boolean): string;
/** The symbol key under which the Rust extractor declares, for a file, a module whose names a top-level glob `use` of the file brings into the file's own module: `path` is the glob's path as written, without the `::*` and with `r#` stripped (`types`, `self::types`, `crate::a::b`). In a crate root, where `self` and `crate` are the same module and a bare first name is a module the root declares, the three spellings name the module at that path below the root. The `glob:` prefix can never be a Rust identifier. */
export declare function rustGlobKey(path: string): string;
/** The symbol key under which the Rust extractor declares, for a file, a module the file declares without a body (`mod x;`), whatever stands in front of it and also in a `cfg_if!` branch. `modulePath` is the module's names from the declaring file's own module, joined by `/` (`x`, or `outer/x` for one inside the inline module `outer`). It says that the name is a module with a file of its own, not where that file is. The `mod:` prefix can never be a Rust identifier. */
export declare function rustModuleKey(modulePath: string): string;
/** The symbol key the Rust extractor declares for a file whose `rustModuleKey` declarations are all the modules it declares without a body: the file parsed to the end and invokes no macro, among its items, that could declare another. Without it a module the file does not list is not known to be absent. It can never be a Rust identifier. */
export declare const RUST_MODULES_KNOWN_KEY = "mods:all";
/** The symbol key under which the Rust extractor declares, for a file, a file its top level loads through a `path` attribute on a `mod` outside inline modules: `path` is the attribute's path, normalized, relative to the declaring file's directory (`platform/linux.rs`, `../shared/util.rs`). The `pathmod:` prefix can never be a Rust identifier. */
export declare function rustPathModuleKey(path: string): string;
/** The symbol key the Rust extractor declares beside each `rustPathModuleKey`, with the file name the path ends in (`linux.rs`): a table answers only whether a key is declared, so this is how the files that may load a given file through a `path` attribute are found. */
export declare function rustPathModuleNameKey(fileName: string): string;
