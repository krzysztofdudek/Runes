/** Production resolvePathToFile: dispatches by language to the per-language path resolver.
 *  Checks existence against the project's files on disk. Symbol-resolved languages (and
 *  not-yet-implemented ones) return undefined here — they resolve via the SymbolTable.
 *
 *  `ownerOf` and `isExcluded`, when supplied, feed every resolver below that can face
 *  MORE THAN ONE candidate file for a single specifier. Go and Java package imports use
 *  `isExcluded` to drop an excluded file from the package's candidate list BEFORE `ownerOf`
 *  is ever asked about it — the package's split-or-single-owner status is decided from what
 *  remains, not from every file the directory happens to hold. Python (multiple ancestor
 *  source roots matching the same dotted module) and PHP (multiple PSR-4 base directories
 *  for one prefix) face the same shape of ambiguity without an owner-set to collapse: their
 *  resolvers use `isExcluded` to drop an excluded match from the candidate SET before
 *  deciding whether resolution is ambiguous, so an excluded duplicate can no longer keep a
 *  real, surviving candidate silenced. Java's own ancestor-source-root search (both a precise
 *  type import and a wildcard package import) is nearest-first-wins rather than
 *  collect-then-decide, so it applies `isExcluded` differently: an excluded hit is treated as
 *  though it does not exist, so the walk keeps climbing to the next candidate — same root,
 *  then further-out roots — instead of letting an excluded nearer copy end the search before
 *  the farther, still-live copy is ever tried (see java-resolve.ts's own doc comment). Either
 *  way this is what keeps an exclusion honest about every OTHER file: excluding one file can
 *  only remove that file's own contribution to the decision — it can never fabricate an owner
 *  or a target a surviving file never had, and it can never bury a real dependency reached
 *  through a file that is still there. A caller resolving a specifier fresh from source — the
 *  specifier can name any file on disk, excluded or not — must supply both `ownerOf` and an `isExcluded` built from the same exclusion set instead of calling this with `ownerOf` and no `isExcluded`:
 *  without `isExcluded`, an excluded file still counts toward the ambiguity decision (or, for
 *  Java, still wins the walk), which can silence a real cross-owner dependency reached through
 *  the surviving, non-excluded, fully enforced candidate. */
export declare function makeResolvePathToFile(projectRoot: string, ownerOf?: (repoRelPosix: string) => string | undefined, isExcluded?: (repoRelPosix: string) => boolean): (specifier: string, fromFile: string, language: string, isPackage?: boolean) => string | undefined;
/** Which Cargo target a package-relative `.rs` path belongs to, following Cargo's target
 *  auto-discovery. `srcDir` is the target's module-tree root and `rootFiles` its crate-root
 *  files in probe order (both package-relative); `fileIsRoot` says whether `rel` IS the
 *  root. A shared helper under `tests/` (`tests/common/mod.rs`) belongs to whichever test
 *  crate declares it, so it gets the `tests/` tree with no root file to bind items to.
 *
 *  `targetPaths` are the `path`s of the manifest's `[[bin]]`, `[[test]]`, `[[example]]` and `[[bench]]` tables. Such a file is the root of its own crate, wherever it lies (ripgrep's `crates/core/main.rs`). A file outside `src/` belongs to the tree of the root whose directory is the deepest one holding it, a target's path or the library's path alike, not to the `src/` tree that holds no part of it; below `tests/`, `examples/` or `benches/` an auto-discovered `<dir>/<name>/main.rs` competes too. In that directory the library's root is probed first and one other root after it, as `src/lib.rs` before `src/main.rs`; two or more other roots there give none, since which of them declares the file's module cannot be told (as for `tests/common/`). A file under `src/` keeps the auto-discovered targets, so a `[[bin]]` that names `src/main.rs` changes nothing for the library beside it, and a library whose path lies outside `src/` is no root of a `src/` file, which is a module of `src/main.rs`.
 *
 *  `undiscoveredDirs` are the directories among `tests`, `examples` and `benches` whose auto-discovery the manifest turns off (`autotests = false`, …): there only declared targets are crates, a target's `path` or, for one that gives only a name (`namedTargets`, `<dir>/<name>`), `<dir>/<name>.rs` or `<dir>/<name>/main.rs` as Cargo infers it, and every other file belongs to the deepest root holding it, as a file outside `src/` does, or to no root. */
export declare function rustTargetFor(rel: string, existsInPackage: (sub: string) => boolean, libPath?: string, targetPaths?: readonly string[], undiscoveredDirs?: readonly string[], namedTargets?: readonly string[]): {
    srcDir: string;
    rootFiles: string[];
    fileIsRoot: boolean;
};
/** The parts of a Cargo.toml the Rust resolver needs. */
interface CargoDependencySpec {
    path?: string;
    package?: string;
    workspace: boolean;
}
interface CargoManifest {
    crateName: string | undefined;
    libPath: string | undefined;
    /** The `path` of each `[[bin]]`, `[[test]]`, `[[example]]` and `[[bench]]` table that names one (an element of the array written inline, `bin = [{ path = … }]`, as much as a `[[bin]]` table), package-relative as written. */
    targetPaths: string[];
    /** The directories (`tests`, `examples`, `benches`) whose target auto-discovery `[package]` turns off (`autotests = false`, `autoexamples = false`, `autobenches = false`). */
    undiscoveredDirs: string[];
    /** `<dir>/<name>` for each `[[test]]`, `[[example]]` or `[[bench]]` that gives a `name` and no `path`: Cargo roots it at `<dir>/<name>.rs` or `<dir>/<name>/main.rs`, whether or not auto-discovery is on. */
    namedTargets: string[];
    dependencies: Map<string, CargoDependencySpec>;
    workspaceDependencies: Map<string, CargoDependencySpec>;
}
/** A minimal Cargo.toml reader over logical lines (`tomlLogicalLines`): `[package].name`, `[lib].name` / `.path`, the `path` of each `[[bin]]`, `[[test]]`, `[[example]]` and `[[bench]]` table (or element of that array written inline, `bin = [{ path = … }]`) and the `name` of a test, example or bench target that gives no `path`, the `[package]` flags `autotests`, `autoexamples` and `autobenches`, and the path / package / workspace fields of dependency entries plus `[workspace.dependencies]`. A field is found by its full TOML key path, so every spelling of it reads alike: an inline table (`package = { name = … }`, `kit = { path = … }`), dotted keys such as `name.workspace = true` or `lib.path = …`, the `[dependencies.<name>]` table form, a dotted key that names the table itself (`dependencies.name.path` above the first header, `dependencies.name.path` inside `[workspace]` or `[target.<cfg>]`), and the dependency table written as one inline table (`dependencies = { name = { path = … } }`). A string value is read as TOML reads it, in any of its four forms (`tomlString`). The first declaration of a crate keeps it, whatever form it or a later declaration takes; only the lines of that one declaration fill its spec. Anything it does not recognise is ignored, which can only lose an edge, never invent one. */
export declare function parseCargoManifest(text: string): CargoManifest;
/** Does Rust source `text` declare an item called `name` (struct / enum / union / trait / type / fn / const / static / mod / macro_rules!), bind it with `extern crate` (the alias of `extern crate x as name;`, else the crate of `extern crate name;`), or bring it into scope with a `use`? */
export declare function rustFileDeclares(text: string, name: string): boolean;
/** The module path declared by go.mod text: `module x`, `module "x"`, ``module `x` ``, or
 *  the block form `module ( x )`. The first declaration wins; undefined when there is none. */
export declare function parseGoModulePath(text: string): string | undefined;
/** The directories named by `use` directives in go.work text (single-line and block form,
 *  quoted or bare), as written — relative to the go.work directory. */
export declare function parseGoWorkUses(text: string): string[];
export {};
