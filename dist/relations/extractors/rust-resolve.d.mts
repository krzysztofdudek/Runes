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
 * own, whose `crate::` is that target's tree, not the library's. A crate ROOT file resolves
 * `mod x;` beside itself (like `mod.rs`); `crateRootFor` says which target a file belongs to
 * and whether it is that target's root. The package's own name always means the library.
 *
 * CRATE-ROOT ITEMS: the module file of `crate` itself is the crate root file, so
 * `crate::Error` for an `enum Error` defined in `src/lib.rs` binds `src/lib.rs`. Because
 * `#[macro_export]` macros also land in the crate-root namespace while being defined
 * elsewhere, the root file is bound for a named item only when it actually declares or
 * `use`s that name (`rootDeclares`); otherwise the path stays silent.
 *
 * PATH DEPENDENCIES: a bare first segment that names an in-repo path dependency of the
 * importing crate (`core-lib = { path = "../core-lib" }`, or `{ workspace = true }` inherited
 * from `[workspace.dependencies]`) resolves inside that crate's library tree. Registry
 * crates are never path dependencies, so they stay external.
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
     *  Absent → the same tree as `srcDir` / `rootFiles`. */
    lib?: RustCrateTree;
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
    /** Does crate-root file `rootFile` declare or `use` an item called `name`? Absent → yes. */
    rootDeclares?(rootFile: string, name: string): boolean;
}
export declare function resolveRustPath(specifier: string, fromFile: string, exists: (repoRelPosix: string) => boolean, deps: RustResolveDeps): string | undefined;
