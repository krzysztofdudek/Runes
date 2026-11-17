import path from 'node:path';

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
 * A name that is an item of a block around the `use` (a `mod` in a function body) is the segment
 * `<block>`, which no source can write: from edition 2018 on the path names that item, in the
 * file, and binds nothing; in edition 2015 a `use` path starts at the crate root, so it is read as
 * written.
 *
 * PATHS OUTSIDE A `use`: a path written in code whose first name is lowercase and bound by
 * nothing in scope where it stands is emitted as `in::<the path>` (`in` is a keyword, so no path
 * of the source starts with it). Rust finds such a name in the extern prelude in every edition:
 * a crate a crate root binds with `extern crate`, the package's own library, or a dependency.
 * It is read as a `use` path is from edition 2018 on, never from the crate root: a path
 * dependency binds its library, and `std`, `core` or a registry crate binds nothing.
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
 * The `mod` that carries the attribute is emitted as `mod::<path>`, the attribute's path
 * normalized and relative to the directory of the file that writes it (`mod` is a keyword, so
 * no path of the source starts with it), and binds that file when it exists in a Cargo package.
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

/** The crate-root lookup context handed to `resolveFromModuleDir`: when the module being
 *  resolved IS the crate root (`dir`), its items live in one of `files`. */
interface RootContext {
  dir: string;
  files: string[];
  declares: (rootFile: string, name: string) => boolean;
  /** Every root file is a crate that certainly compiles the importing file, so none binds a root item. Otherwise the root files are probed in order and the first existing one that holds a name binds it. */
  shared: boolean;
}

export function resolveRustPath(
  specifier: string,
  fromFile: string,
  exists: (repoRelPosix: string) => boolean,
  deps: RustResolveDeps,
): string | undefined {
  const segments = specifier.split('::').filter((s) => s.length > 0);
  if (segments.length === 0) return undefined;

  const root = segments[0];
  const rest = segments.slice(1);
  const declares = declaresOf(deps);

  if (root === 'super' || root === 'self') {
    return resolveRelative(root, segments, fromFile, exists, deps);
  }

  const crate = deps.crateRootFor(fromFile);
  if (crate === undefined) return undefined; // no Cargo.toml ancestor → not a crate path

  // A `mod` with a `path` attribute among the items of its file (`mod::<path>`): the file the attribute names, relative to the directory of the file that writes it.
  if (root === 'mod') {
    const written = specifier.startsWith('mod::') ? specifier.slice('mod::'.length) : '';
    const file = written === '' ? undefined : joinUnder(dirOfFile(toPosix(fromFile)), written);
    return file !== undefined && exists(file) ? file : undefined;
  }

  if (root === 'crate') {
    if (crate.unrooted === true) return undefined;
    return resolveFromModuleDir(crate.srcDir, rest, exists, rootContext(crate.srcDir, crate.rootFiles, declares, crate.rootsShared), moduleCheckOf(deps));
  }

  // A crate named for certain (`extern::<crate>`), or a `use` path whose first name an `extern crate` of its own scope binds (`extern::<crate>::as::<name>::…`). In edition 2015 the second is no exception to the rule that a `use` path starts at the crate root, so it is read as the path it was written as.
  if (root === 'extern') {
    const name = segments[1];
    if (name === undefined) return undefined;
    const aliased = segments[2] === 'as';
    if (aliased && crate.crateRelativeUses === true) return resolveBare(segments.slice(3), fromFile, exists, deps, crate);
    const named = crateNamed(name, fromFile, deps, crate);
    return named === undefined ? undefined : resolveFromModuleDir(named.srcDir, segments.slice(aliased ? 4 : 2), exists, rootContext(named.srcDir, named.rootFiles, declares), moduleCheckOf(deps));
  }

  // A path written outside a `use` whose first name nothing in scope binds (`in::<the path>`): in every edition that name is a crate of the extern prelude, as a 2018 `use` path reads it.
  if (root === 'in') return resolveBare(segments.slice(1), fromFile, exists, deps, { ...crate, crateRelativeUses: false });

  // A `use` path whose first name is in scope where it is written (`use::<n>::<the n segments that name stands for>::<the path as written>`). From edition 2018 that name is what the path starts at; in edition 2015 a `use` path starts at the crate root whatever is in scope, so it is read as written.
  if (root === 'use') {
    const lead = Number(segments[1]);
    const written = segments.slice(2 + lead);
    if (!Number.isInteger(lead) || lead < 1 || written.length === 0) return undefined;
    // The name is an item of a block around the `use` (`<block>`, which no source can write): from edition 2018 on it names that item, in this file.
    if (segments[2] === '<block>' && crate.crateRelativeUses !== true) return undefined;
    if (crate.crateRelativeUses === true) return resolveBare(written, fromFile, exists, deps, crate);
    return resolveRustPath([...segments.slice(2, 2 + lead), ...written.slice(1)].join('::'), fromFile, exists, deps);
  }

  return resolveBare(segments, fromFile, exists, deps, crate);
}

/**
 * Why a path `resolveRustPath` bound no file came to nothing, read the way it reads the path: `unfollowed` when the path starts in the crate (`crate`, `self`, `super`, a file a `path` attribute names, an item of a block, a name in scope that stands for a path of the crate), at the package's own crate name, at an in-repo path dependency or a crate an `extern crate` binds to one, or in edition 2015 at an item of the crate root; `outside` when it starts at any other crate (`std`, `core`, a registry or git dependency); undefined when the file belongs to no Cargo package.
 */
export function explainRustMiss(specifier: string, fromFile: string, exists: (repoRelPosix: string) => boolean, deps: RustResolveDeps): 'outside' | 'unfollowed' | undefined {
  const segments = specifier.split('::').filter((s) => s.length > 0);
  const root = segments[0];
  if (root === undefined) return undefined;
  if (root === 'super' || root === 'self' || root === 'mod') return 'unfollowed';
  const crate = deps.crateRootFor(fromFile);
  if (crate === undefined) return undefined;
  if (root === 'crate') return 'unfollowed';
  if (root === 'extern') {
    const name = segments[1];
    if (name === undefined) return undefined;
    if (segments[2] === 'as' && crate.crateRelativeUses === true) return bareMiss(segments.slice(3), fromFile, exists, deps, crate);
    return crateNamed(name, fromFile, deps, crate) === undefined ? 'outside' : 'unfollowed';
  }
  if (root === 'in') return bareMiss(segments.slice(1), fromFile, exists, deps, { ...crate, crateRelativeUses: false });
  if (root === 'use') {
    const lead = Number(segments[1]);
    const written = segments.slice(2 + lead);
    if (!Number.isInteger(lead) || lead < 1 || written.length === 0) return undefined;
    if (crate.crateRelativeUses === true) return bareMiss(written, fromFile, exists, deps, crate);
    if (segments[2] === '<block>') return 'unfollowed';
    return explainRustMiss([...segments.slice(2, 2 + lead), ...written.slice(1)].join('::'), fromFile, exists, deps);
  }
  return bareMiss(segments, fromFile, exists, deps, crate);
}

/** {@link explainRustMiss} for a path that starts with a bare name, as `resolveBare` reads it. */
function bareMiss(segments: string[], fromFile: string, exists: (repoRelPosix: string) => boolean, deps: RustResolveDeps, crate: RustCrateRoot): 'outside' | 'unfollowed' | undefined {
  const root = segments[0];
  if (root === undefined) return undefined;
  const roots = crate.crateRelativeUses === true ? (crate.crateRelativeRoots ?? crate.rootFiles ?? []) : (crate.rootFiles ?? []);
  if (deps.externCrateFor !== undefined && roots.some((file) => exists(file) && deps.externCrateFor!(fromFile, file, root) !== undefined)) return 'unfollowed';
  if (crateNamed(root, fromFile, deps, crate) !== undefined) return 'unfollowed';
  if (crate.crateRelativeUses === true && !EDITION_2015_EXTERNAL_ROOTS.has(root) && roots.some((file) => exists(file) && (deps.rootDeclares?.(file, root, true) ?? true))) return 'unfollowed';
  return 'outside';
}

/** The library tree the crate name `name` stands for in the package of `fromFile`: the package's own library (2018+ path clarity addresses it from any of its targets), else an in-repo path dependency. */
function crateNamed(name: string, fromFile: string, deps: RustResolveDeps, crate: RustCrateRoot): RustCrateTree | undefined {
  if (crate.crateName !== undefined && name === crate.crateName && crate.lib !== null) return crate.lib ?? { srcDir: crate.srcDir, rootFiles: crate.rootFiles ?? [] };
  return deps.dependencyFor?.(fromFile, name);
}

/** Resolve a path that starts with a bare identifier (`segments`, not empty), as a `use` writes it. */
function resolveBare(segments: string[], fromFile: string, exists: (repoRelPosix: string) => boolean, deps: RustResolveDeps, crate: RustCrateRoot): string | undefined {
  const root = segments[0];
  if (root === undefined) return undefined;
  const rest = segments.slice(1);
  const declares = declaresOf(deps);
  const into = (tree: RustCrateTree): string | undefined => resolveFromModuleDir(tree.srcDir, rest, exists, rootContext(tree.srcDir, tree.rootFiles, declares), moduleCheckOf(deps));
  const own = crate.crateName !== undefined && root === crate.crateName && crate.lib !== null ? (crate.lib ?? { srcDir: crate.srcDir, rootFiles: crate.rootFiles ?? [] }) : undefined;
  const declaresItem = (f: string, name: string): boolean => (deps.rootDeclares?.(f, name, true) ?? true);

  if (crate.crateRelativeUses === true && deps.externCrateFor !== undefined) {
    // Edition 2015, with what each root binds at hand: the path is relative to the crate root. The first segment is what the first root that binds it makes of it: a crate it binds with `extern crate`, the package's own library included, or a module or an item of its own. A crate that no root binds is not in reach of a `use`, a path dependency or the package's own library alike; the reserved crates stay external.
    const roots = crate.crateRelativeRoots ?? crate.rootFiles ?? [];
    for (const file of roots) {
      if (!exists(file)) continue;
      const bound = deps.externCrateFor(fromFile, file, root);
      if (bound !== undefined) return into(bound);
      if (!EDITION_2015_EXTERNAL_ROOTS.has(root) && declaresItem(file, root)) return resolveFromModuleDir(crate.srcDir, segments, exists, rootContext(crate.srcDir, roots, declaresItem, crate.rootsShared), moduleCheckOf(deps));
    }
    return undefined;
  }

  // A name the crate root binds with `extern crate` is in the extern prelude of every module of the crate.
  if (deps.externCrateFor !== undefined) {
    for (const file of crate.rootFiles ?? []) {
      const bound = exists(file) ? deps.externCrateFor(fromFile, file, root) : undefined;
      if (bound !== undefined) return into(bound);
    }
  }

  // The current crate's own package name (2018+ edition path-clarity) addresses the package's LIBRARY, from any of its targets.
  if (own !== undefined) return into(own);

  // An in-repo path dependency of this crate → that crate's library tree.
  const dep = deps.dependencyFor?.(fromFile, root);
  if (dep !== undefined) return into(dep);

  // Edition 2015 without the pass's symbol table: a `use` path is relative to the crate root, so `use a::b;` names the root's module `a`; no name is known to be an item of the root then, so nothing binds.
  if (crate.crateRelativeUses === true && !EDITION_2015_EXTERNAL_ROOTS.has(root)) {
    const rootFiles = crate.crateRelativeRoots ?? crate.rootFiles ?? [];
    if (rootFiles.some((f) => exists(f) && declaresItem(f, root))) return resolveFromModuleDir(crate.srcDir, segments, exists, rootContext(crate.srcDir, rootFiles, declaresItem, crate.rootsShared), moduleCheckOf(deps));
  }

  // External crate (std/core/alloc, third-party) — not a resolvable path.
  return undefined;
}

/** The symbol key under which the Rust extractor declares `name` for a file whose top level binds it as an item (an item the file defines there, one an `extern` block or a known item macro defines there, or a name a top-level `use` brings in). It is what an edition 2015 `use` path from the crate root can name in that file when the file is the crate root; the key's `item:` prefix keeps it apart from the extractor's other declarations and can never be a Rust identifier. */
export function rustTopLevelItemKey(name: string): string {
  return `item:${name}`;
}

/** The symbol key under which the Rust extractor declares `name` for a file whose top level binds it with `extern crate` (the alias of `extern crate a as name;`, else the crate of `extern crate name;`). Such a name is a name of the file's module that a `crate::` path, or a path into a dependency, can go through (`pub extern crate inner as name;` in a facade), and no item an edition 2015 `use` path names. The `extern:` prefix can never be a Rust identifier. */
export function rustExternNameKey(name: string): string {
  return `extern:${name}`;
}

/** The symbol key under which the Rust extractor declares, for a file whose top level writes `extern crate <crate> as <name>;` or `extern crate <name>;`, that `name` stands for the crate `crate` there (both as written in code, with `r#` stripped). A table answers only whether a key is declared, so the resolver asks it for each crate the importing package can name. */
export function rustExternBindingKey(name: string, crate: string): string {
  return `extern:${name}=${crate}`;
}

/** The symbol key under which the Rust extractor declares, for a file, a module that the file places in a file of its own by name alone: a `mod x;` with no `path` attribute and no macro around it. `modulePath` is the module's names from the declaring file's own module, joined by `/` (`x`, or `outer/x` for one inside the inline module `outer`). A declaration that a `cfg` may remove (`conditional`) has a key of its own, `modfile?:<path>`, so it is never taken for one that always holds, `modfile:<path>`. Neither prefix can be a Rust identifier. */
export function rustModuleFileKey(modulePath: string, conditional = false): string {
  return `${conditional ? 'modfile?' : 'modfile'}:${modulePath}`;
}

/** The symbol key under which the Rust extractor declares, for a file, a module whose names a top-level glob `use` of the file brings into the file's own module: `path` is the glob's path as written, without the `::*` and with `r#` stripped (`types`, `self::types`, `crate::a::b`). In a crate root, where `self` and `crate` are the same module and a bare first name is a module the root declares, the three spellings name the module at that path below the root. The `glob:` prefix can never be a Rust identifier. */
export function rustGlobKey(path: string): string {
  return `glob:${path}`;
}

/** The symbol key the Rust extractor declares beside `rustGlobKey(path)` when a `cfg` in front of the glob's `use` may remove it (`#[cfg(unix)] pub use unix::*;`). Two globs that bring the same name in are ambiguous only when nothing can switch either off. The `glob?:` prefix can never be a Rust identifier. */
export function rustConditionalGlobKey(path: string): string {
  return `glob?:${path}`;
}

/** The symbol key under which the Rust extractor declares, for a file, a module the file declares without a body (`mod x;`), whatever stands in front of it and also in a `cfg_if!` branch. `modulePath` is the module's names from the declaring file's own module, joined by `/` (`x`, or `outer/x` for one inside the inline module `outer`). It says that the name is a module with a file of its own, not where that file is. The `mod:` prefix can never be a Rust identifier. */
export function rustModuleKey(modulePath: string): string {
  return `mod:${modulePath}`;
}

/** The symbol key the Rust extractor declares for a file whose `rustModuleKey` declarations are all the modules it declares without a body: the file parsed to the end and invokes no macro, among its items, that could declare another. Without it a module the file does not list is not known to be absent. It can never be a Rust identifier. */
export const RUST_MODULES_KNOWN_KEY = 'mods:all';

/** The symbol key under which the Rust extractor declares, for a file, a file its top level loads through a `path` attribute on a `mod` outside inline modules: `path` is the attribute's path, normalized, relative to the declaring file's directory (`platform/linux.rs`, `../shared/util.rs`). The `pathmod:` prefix can never be a Rust identifier. */
export function rustPathModuleKey(path: string): string {
  return `pathmod:${path}`;
}

/** The symbol key under which the Rust extractor declares, for a file, a file one of its inline modules loads through a `path` attribute on a `mod`: `path` is the attribute's path, normalized, with the names of the inline modules around the `mod` in front (`outer/loaded.rs`). It is relative to the directory the file's modules lie in, which only the reader of the table knows: the file's own directory where the file is a module root (a `lib.rs`, a `main.rs`, any root a manifest or Cargo names, a `mod.rs`) or was loaded through a `path` attribute itself, else a directory named after the file beside it. */
export function rustInlinePathModuleKey(path: string): string {
  return `pathmod-inline:${path}`;
}

/** The symbol key the Rust extractor declares beside each `rustPathModuleKey`, with the file name the path ends in (`linux.rs`): a table answers only whether a key is declared, so this is how the files that may load a given file through a `path` attribute are found. */
export function rustPathModuleNameKey(fileName: string): string {
  return `pathmod-name:${fileName}`;
}

/** Crates every edition 2015 crate root has in scope without a module of its own to shadow them. */
const EDITION_2015_EXTERNAL_ROOTS = new Set(['std', 'core', 'alloc', 'proc_macro', 'test']);

/** The crate-root name check: the deps' own, or "every name is declared" when absent. */
function declaresOf(deps: RustResolveDeps): (rootFile: string, name: string) => boolean {
  return deps.rootDeclares ?? ((): boolean => true);
}

function rootContext(
  dir: string,
  files: string[] | undefined,
  declares: (rootFile: string, name: string) => boolean,
  shared = false,
): RootContext | undefined {
  return files === undefined || files.length === 0 ? undefined : { dir, files, declares, shared };
}

/**
 * `super::…` / `self::…` — resolve relative to the importing file's MODULE.
 *
 * The importing file's module directory is the directory that would contain a child
 * module's file. For `src/a/b.rs` (module `crate::a::b`) the module's "own" directory
 * for `self::X` is `src/a/b/` (a submodule of b lives there) but b's items also live
 * in `b.rs` itself — so `self::X` probes both `src/a/b/X.rs`/`mod.rs` AND treats `X`
 * as an item of `b.rs`. For `src/a/mod.rs` (module `crate::a`) the module dir is
 * `src/a/`. `super::` climbs one module level: from `src/a/b.rs` (module `a::b`),
 * `super` is module `a`, whose dir is `src/a/` (and items live in `a.rs`/`a/mod.rs`).
 *
 * We model this as: derive the file's module DIRECTORY and its FILE-self candidates,
 * climb one directory level per leading `super`, then resolve the tail as a module
 * path under the resulting directory (with the longest-match item fallback).
 */
function resolveRelative(
  root: string,
  segments: string[],
  fromFile: string,
  exists: (repoRelPosix: string) => boolean,
  deps: RustResolveDeps,
): string | undefined {
  const crate = deps.crateRootFor(fromFile);
  if (crate === undefined) return undefined;
  const fromPosix = toPosix(fromFile);
  const loaders = deps.pathLoaders?.(fromPosix) ?? [];

  // A file loaded through a `path` attribute is a child of the module of the file that loads it, wherever the two lie: its first `super` is that file's `self`. The same file may also be a module by its name, declared by the module above its place, which is then its parent as well: that parent is read first, as it was before loaders were known, and the loader only where it names nothing. Two loaders leave the parent untold. Each step spends one `super`, so the walk ends.
  const lead = segments.findIndex((s) => s !== 'self' && s !== 'super');
  const supers = segments.slice(0, lead === -1 ? segments.length : lead).filter((s) => s === 'super').length;
  if (supers > 0 && loaders.length > 0 && crate.fileIsRoot !== true) {
    const viaLoader = (): string | undefined => {
      if (loaders.length > 1) return undefined;
      const rest = segments.slice(lead === -1 ? segments.length : lead);
      const climb = [...new Array<string>(supers - 1).fill('super'), ...rest];
      const next = climb[0] === 'super' ? climb : ['self', ...climb];
      return resolveRelative(next[0]!, next, loaders[0]!, exists, deps);
    };
    if (!declaredByName(fromPosix, crate, exists, deps)) return viaLoader();
    return resolveByPlace(root, segments, fromPosix, exists, deps, crate, loaders) ?? viaLoader();
  }
  return resolveByPlace(root, segments, fromPosix, exists, deps, crate, loaders);
}

/** Whether the module above the place of `file` declares it by its name (`mod util;` in `src/lib.rs` for `src/util.rs`): the crate's root files where that module is the crate root, else its `<dir>.rs` or `<dir>/mod.rs`. */
function declaredByName(file: string, crate: RustCrateRoot, exists: (repoRelPosix: string) => boolean, deps: RustResolveDeps): boolean {
  if (deps.moduleDeclared === undefined) return false;
  const dir = path.posix.dirname(file);
  const baseName = path.posix.basename(file, '.rs');
  const name = baseName === 'mod' ? path.posix.basename(dir) : baseName;
  const above = baseName === 'mod' ? path.posix.dirname(dir) : dir;
  const files = path.posix.normalize(above) === path.posix.normalize(crate.srcDir) ? (crate.rootFiles ?? []) : [above + '.rs', joinUnder(above, 'mod.rs')];
  return files.some((f) => f !== undefined && exists(f) && deps.moduleDeclared!(f, name) === true);
}

/** `resolveRelative` by the place of `fromPosix` on disk, a file loaded through a `path` attribute (`loaders`) owning the directory it lies in. */
function resolveByPlace(
  root: string,
  segments: string[],
  fromPosix: string,
  exists: (repoRelPosix: string) => boolean,
  deps: RustResolveDeps,
  crate: RustCrateRoot,
  loaders: string[],
): string | undefined {
  const fromFile = fromPosix;
  const srcDir = crate.srcDir;
  const fromDir = path.posix.dirname(fromPosix);
  const baseName = path.posix.basename(fromPosix, '.rs');

  // The module directory of the importing file: for `mod.rs` and for a crate ROOT file
  // (`src/lib.rs`, `src/main.rs`, `src/bin/x.rs`, `tests/it.rs`, …) it is the file's own
  // directory; for `foo.rs` it is `<dir>/foo` (the dir that would hold foo's submodules).
  // This is the directory `self::` resolves against. Without target knowledge from the
  // deps, the legacy basename rule treats any `lib.rs` / `main.rs` as a root.
  const isRoot = crate.fileIsRoot ?? (baseName === 'lib' || baseName === 'main');
  let moduleDir = baseName === 'mod' || isRoot ? fromDir : path.posix.join(fromDir, baseName);

  // Count leading super/self segments. `self` consumes one segment and stays; each
  // `super` consumes one segment and climbs one module level.
  let i = 0;
  let climbed = false;
  for (; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === 'self') {
      // self only meaningfully appears first; treat as no climb.
      continue;
    }
    if (seg === 'super') {
      const parent = path.posix.dirname(moduleDir);
      if (!withinSrc(parent, srcDir)) return undefined; // climbed above the crate root
      moduleDir = parent;
      climbed = true;
      continue;
    }
    break;
  }
  // `root` is the first segment; the loop above already consumed it (self/super). The
  // remaining tail starts at i.
  void root;
  const tail = segments.slice(i);
  // A module of a crate that cannot be told reaches the crate root by climbing out of the tree's first level, and which crate's root that is, is not known; below it the path is the same in every crate.
  if (crate.unrooted === true && path.posix.normalize(moduleDir) === path.posix.normalize(srcDir)) return undefined;
  const crateRoot = rootContext(srcDir, crate.rootFiles, declaresOf(deps), crate.rootsShared);
  const pathLoaded = !climbed && baseName !== 'mod' && !isRoot && loaders.length > 0;
  // A name the module's file binds with `extern crate` (`extern crate util as u;` then `self::u::X`, or `super::u::X` from a child) is that crate. A module of the same name beside it would be a second definition, which Rust refuses.
  const first = tail[0];
  if (first !== undefined && deps.externCrateFor !== undefined) {
    const atCrateRoot = path.posix.normalize(moduleDir) === path.posix.normalize(srcDir);
    const files = pathLoaded ? [fromPosix] : atCrateRoot ? (crate.rootsShared === true ? [] : (crate.rootFiles ?? [])) : [moduleDir + '.rs', joinUnder(moduleDir, 'mod.rs')];
    for (const file of files) {
      const bound = file !== undefined && exists(file) ? deps.externCrateFor(fromFile, file, first) : undefined;
      if (bound !== undefined) return resolveFromModuleDir(bound.srcDir, tail.slice(1), exists, rootContext(bound.srcDir, bound.rootFiles, declaresOf(deps)), moduleCheckOf(deps));
    }
  }
  // A file loaded through a `path` attribute owns its directory, so what it names below itself lies beside it; the file itself holds its items. Where nothing beside it fits, the directory named after it is still read: the same file may be a module by its name as well.
  if (pathLoaded) {
    const beside = resolveFromModuleDir(fromDir, tail, exists, crateRoot, moduleCheckOf(deps), fromPosix);
    if (beside !== fromPosix) return beside;
  }
  return resolveFromModuleDir(moduleDir, tail, exists, crateRoot, moduleCheckOf(deps));
}

/**
 * Resolve a module-relative tail (`['a','b','Sym']`) under a starting module
 * directory to a `.rs` file. Mirrors Rust's file layout with the longest-match
 * fallback for the case where the final segment(s) are ITEMS inside a module file
 * rather than submodules:
 *
 *   dir + a::b::Sym  → candidates, longest module-path first:
 *     <dir>/a/b/Sym.rs, <dir>/a/b/Sym/mod.rs        (Sym is a module)
 *     <dir>/a/b.rs,     <dir>/a/b/mod.rs            (Sym is an item in module a::b)
 *     <dir>/a.rs,       <dir>/a/mod.rs              (b::Sym are items in module a)
 *
 * Also the empty tail resolves to the module dir itself (`<dir>/mod.rs` is not used
 * here because `dir` already IS the module dir; the self/super caller handles that).
 * When the module dir IS the crate root (`root.dir`), the crate root module's file is the
 * crate root file: the empty tail binds the first existing `root.files` entry, and an item
 * tail binds the first root file that declares the item's name (`root.declares`); when the root
 * files are crates that all compile the importing file (`root.shared`) neither binds.
 * The FIRST existing candidate wins. Any miss → undefined (silence).
 * `own` names the file of the module at `moduleDir` where its place does not tell it (a file
 * loaded through a `path` attribute, which owns the directory it lies in): it holds the
 * module's items and declares its children.
 */
function resolveFromModuleDir(
  moduleDir: string,
  tail: string[],
  exists: (repoRelPosix: string) => boolean,
  root?: RootContext,
  modules?: ModuleCheck,
  own?: string,
): string | undefined {
  const atRoot = own === undefined && root !== undefined && path.posix.normalize(moduleDir) === path.posix.normalize(root.dir);
  const segs = tail.filter((s) => s.length > 0);
  if (segs.length === 0) {
    // Path is just `crate`/`self`/the module itself → the module's own file.
    if (own !== undefined) return own;
    for (const cand of [joinUnder(moduleDir, 'mod.rs'), moduleDir + '.rs']) {
      if (cand !== undefined && exists(cand)) return cand;
    }
    if (atRoot) return rootFileFor(root, exists, () => true);
    return undefined;
  }

  // Try the longest module-path prefix first, shrinking the module part as the tail
  // segments are reinterpreted as items. For each prefix length k (segs[0..k] as a
  // module path), probe `<dir>/<seg0..segk>.rs` and `.../mod.rs`.
  for (let k = segs.length; k >= 1; k--) {
    const modulePart = segs.slice(0, k).join('/');
    const found = [joinUnder(moduleDir, modulePart + '.rs'), joinUnder(moduleDir, modulePart + '/mod.rs')].filter((c): c is string => c !== undefined && exists(c));
    if (found.length === 0) continue;
    // A file that fits the name is the module only when a module above it declares it. Where the files above are known to declare none, the name is an item of the module above; where nothing is known, the file is taken, unless it is another target's root.
    const declared = modules === undefined ? undefined : moduleIsDeclared(moduleDir, segs, k, exists, own !== undefined ? [own] : atRoot ? root.files : undefined, modules);
    if (declared === false) continue;
    const file = declared === true ? found[0] : found.find((c) => modules?.isTargetRoot(c) !== true);
    if (file !== undefined) return file;
  }
  // Final fallback: the ENTIRE tail is items inside THIS module — the owning file is
  // the module dir's own file (`<dir>.rs` or `<dir>/mod.rs`). This covers e.g.
  // `super::Type` resolving against module `crate::a` whose file is `src/a.rs`.
  if (own !== undefined) return own;
  for (const cand of [moduleDir + '.rs', joinUnder(moduleDir, 'mod.rs')]) {
    if (cand !== undefined && exists(cand)) return cand;
  }
  // The crate root module's items live in the crate root file — bound only when that file
  // really declares (or `use`s) the first item name, so a crate-root-namespace name defined
  // elsewhere (a `#[macro_export]` macro) is never pinned on the root file.
  if (atRoot) return rootFileFor(root, exists, (f) => root.declares(f, segs[0]));
  return undefined;
}

/** What is known of the modules files declare, for `resolveFromModuleDir`: whether a file declares a module below its own (`RustResolveDeps.moduleDeclared`), and whether a file is the root of a Cargo target. */
interface ModuleCheck {
  declared: (file: string, modulePath: string) => boolean | undefined;
  isTargetRoot: (file: string) => boolean;
}

/** The module check of `deps`, or none when they know no file's modules (a call without the pass's table), where a path resolves as it did before any was known. */
function moduleCheckOf(deps: RustResolveDeps): ModuleCheck | undefined {
  const declared = deps.moduleDeclared;
  return declared === undefined ? undefined : { declared: (file, modulePath) => declared(file, modulePath), isTargetRoot: (file) => deps.crateRootFor(file)?.fileIsRoot === true };
}

/** Whether the module `segs[0..k]` below the module directory `moduleDir` is declared by a file of a module above it: the file of `segs[0..j]` for some `j < k`, which declares it through its inline modules `segs[j..k-1]`, down to the files of the module at `moduleDir` itself (`rootFiles` when that is the crate root, or a file its place does not tell). True when one declares it, false when at least one such file exists and each that exists is known not to, undefined otherwise. */
function moduleIsDeclared(moduleDir: string, segs: string[], k: number, exists: (repoRelPosix: string) => boolean, rootFiles: string[] | undefined, modules: ModuleCheck): boolean | undefined {
  let answered = false;
  let unknown = false;
  for (let j = k - 1; j >= 0; j--) {
    const above = segs.slice(0, j).join('/');
    const files = j > 0 ? [joinUnder(moduleDir, above + '.rs'), joinUnder(moduleDir, above + '/mod.rs')] : (rootFiles ?? [moduleDir + '.rs', joinUnder(moduleDir, 'mod.rs')]);
    for (const file of files) {
      if (file === undefined || !exists(file)) continue;
      const declares = modules.declared(file, segs.slice(j, k).join('/'));
      if (declares === true) return true;
      if (declares === undefined) unknown = true;
      else answered = true;
    }
  }
  return answered && !unknown ? false : undefined;
}

/** The crate-root file of `root` that holds the name `fits` asks about: the first existing one that does. None when the root files are crates that all compile the importing file (`root.shared`): `crate::` is a different root in each, and which one a root item is cannot be told. */
function rootFileFor(root: RootContext, exists: (repoRelPosix: string) => boolean, fits: (rootFile: string) => boolean): string | undefined {
  return root.shared ? undefined : root.files.find((f) => exists(f) && fits(f));
}

/** Is `dir` within (or equal to) the crate `src` root? Guards `super::` climbing
 *  above the crate root, which is an external/invalid path → silence. */
function withinSrc(dir: string, srcDir: string): boolean {
  const d = path.posix.normalize(dir);
  const s = path.posix.normalize(srcDir);
  if (s === '' || s === '.') return !d.startsWith('..');
  return d === s || d.startsWith(s + '/');
}

/** Join a repo-relative directory with a sub-path, normalizing; reject any path that
 *  escapes the repo root. '' → the sub-path itself. */
function joinUnder(dir: string, sub: string): string | undefined {
  const joined = path.posix.normalize(dir === '' ? sub : path.posix.join(dir, sub));
  if (joined.startsWith('..')) return undefined;
  return joined;
}

/** The repository-relative directory of a file, '' at the repository root. */
function dirOfFile(file: string): string {
  const dir = path.posix.dirname(file);
  return dir === '.' ? '' : dir;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}
