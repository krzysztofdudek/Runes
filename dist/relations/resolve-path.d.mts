import { type FileView } from './file-view.mjs';
import { type RelationDiagnostic } from './diagnostics.mjs';
/** What `makeResolvePathToFile` takes besides the root and the owner and exclusion lookups. Every field is optional; a minor release may add more. */
export interface ResolvePathOptions {
    /** The files resolution sees (see `FileView`). Without it every resolver reads the disk under the project root. */
    files?: FileView;
    /**
     * Told, synchronously and at most once per `(code, file)` for this resolver, when resolution consults a configuration file it cannot read: a `tsconfig*.json`, `jsconfig*.json`, `package.json`, `composer.json` or `compile_commands.json` that does not parse, or a `pnpm-workspace.yaml` whose `packages:` list it cannot read. A file nothing consulted stays quiet, and a file with a byte order mark that a reader skips never reports. Resolution itself is unchanged: an unreadable file still governs nothing, so the diagnostic only makes that silence visible. The Cargo, `go.mod` and project-file readers take their lines as they find them and never fail to parse, so they report nothing.
     */
    onDiagnostic?: (diagnostic: RelationDiagnostic) => void;
}
/** Production resolvePathToFile: dispatches by language to the per-language path resolver.
 *  Checks existence against the project's files: the disk under `projectRoot`, or, when `options.files` is given, only the files that view holds (every read of every resolver goes through it, so build output, a generated config or an installed package that the view does not list cannot decide where an import lands). Symbol-resolved languages (and
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
export declare function makeResolvePathToFile(projectRoot: string, ownerOf?: (repoRelPosix: string) => string | undefined, isExcluded?: (repoRelPosix: string) => boolean, options?: ResolvePathOptions): (specifier: string, fromFile: string, language: string, isPackage?: boolean) => string | undefined;
/** Which Cargo target a package-relative `.rs` path belongs to, following Cargo's target
 *  auto-discovery. `srcDir` is the target's module-tree root and `rootFiles` its crate-root
 *  files in probe order (both package-relative); `fileIsRoot` says whether `rel` IS the
 *  root. A shared helper under `tests/` (`tests/common/mod.rs`) belongs to whichever test
 *  crate declares it, so it gets the `tests/` tree with no root file to bind items to.
 *
 *  `targetPaths` are the `path`s of the manifest's `[[bin]]`, `[[test]]`, `[[example]]` and `[[bench]]` tables. Such a file is the root of its own crate, wherever it lies (ripgrep's `crates/core/main.rs`). A file outside `src/` belongs to the tree of the root whose directory is the deepest one holding it, a target's path or the library's path alike, not to the `src/` tree that holds no part of it; below `tests/`, `examples/` or `benches/` an auto-discovered `<dir>/<name>/main.rs` competes too. In that directory the library's root is probed first and one other root after it, as `src/lib.rs` before `src/main.rs`; two or more other roots there give none, since which of them declares the file's module cannot be told (as for `tests/common/`). A file under `src/` keeps the auto-discovered targets, so a `[[bin]]` that names `src/main.rs` changes nothing for the library beside it, and a library whose path lies outside `src/` is no root of a `src/` file, which is a module of `src/main.rs`.
 *
 *  `inferMain` says whether Cargo infers `src/main.rs` as a binary; it does not when `autobins = false`, and then the file is a root only when a `[[bin]]` names it by `path` (or by a name equal to the package's, which the caller reports as `inferMain`), and is otherwise no root of any crate.
 *
 *  `undiscoveredDirs` are the directories among `src/bin`, `tests`, `examples` and `benches` whose auto-discovery the manifest turns off (`autobins = false`, `autotests = false`, …): there only declared targets are crates, a target's `path` or, for one that gives only a name (`namedTargets`, `<dir>/<name>`), `<dir>/<name>.rs` or `<dir>/<name>/main.rs` as Cargo infers it, and every other file belongs to the deepest root holding it, as a file outside `src/` does, or to no root. */
export declare function rustTargetFor(rel: string, existsInPackage: (sub: string) => boolean, libPath?: string, targetPaths?: readonly string[], undiscoveredDirs?: readonly string[], namedTargets?: readonly string[], inferMain?: boolean): {
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
    /** `<dir>/<name>` for each `[[bin]]`, `[[test]]`, `[[example]]` or `[[bench]]` that gives a `name` and no `path`: Cargo roots it at `<dir>/<name>.rs` or `<dir>/<name>/main.rs`, whether or not auto-discovery is on. */
    namedTargets: string[];
    /** Whether a `[package]` table is written at all (a virtual workspace manifest has none, and no crate of its own). */
    hasPackage: boolean;
    /** `[package].edition` as written (`"2018"`), undefined when absent or inherited. */
    edition: string | undefined;
    /** `[package]` takes its edition from the workspace (`edition.workspace = true`). */
    editionInherited: boolean;
    /** `[workspace.package].edition`, which a member's `edition.workspace = true` inherits. */
    workspaceEdition: string | undefined;
    /** `[lib].edition` as written, undefined when absent: the edition of the library target alone. */
    libEdition: string | undefined;
    /** The `[package].name` as written (a bin of that name and no path is rooted at `src/main.rs`). */
    packageName: string | undefined;
    /** Every `[[bin]]`, `[[test]]`, `[[example]]` or `[[bench]]` that writes an `edition` of its own. */
    targetEditions: CargoTargetEdition[];
    /** Whether a `[[bin]]` named like the package and giving no `path` is written: Cargo roots it at `src/main.rs`. */
    declaresMainBin: boolean;
    dependencies: Map<string, CargoDependencySpec>;
    workspaceDependencies: Map<string, CargoDependencySpec>;
}
/** The `edition` a `[[bin]]`, `[[test]]`, `[[example]]` or `[[bench]]` table writes for its own target, and how its root file is told: by `path`, or by `name` alone (Cargo roots it in its kind's directory, or a bin named like the package at `src/main.rs`). */
interface CargoTargetEdition {
    kind: string;
    name: string | undefined;
    path: string | undefined;
    edition: string;
}
/** A minimal Cargo.toml reader over logical lines (`tomlLogicalLines`): `[package].name`, `[lib].name` / `.path`, the `path` of each `[[bin]]`, `[[test]]`, `[[example]]` and `[[bench]]` table (or element of that array written inline, `bin = [{ path = … }]`) and the `name` of a test, example or bench target that gives no `path`, the `[package]` flags `autobins`, `autotests`, `autoexamples` and `autobenches`, the `[package]` edition (written, inherited with `edition.workspace = true` from `[workspace.package]`, or absent), and the path / package / workspace fields of dependency entries plus `[workspace.dependencies]`. A field is found by its full TOML key path, so every spelling of it reads alike: an inline table (`package = { name = … }`, `kit = { path = … }`), dotted keys such as `name.workspace = true` or `lib.path = …`, the `[dependencies.<name>]` table form, a dotted key that names the table itself (`dependencies.name.path` above the first header, `dependencies.name.path` inside `[workspace]` or `[target.<cfg>]`), and the dependency table written as one inline table (`dependencies = { name = { path = … } }`). A string value is read as TOML reads it, in any of its four forms (`tomlString`). The first declaration of a crate keeps it, whatever form it or a later declaration takes; only the lines of that one declaration fill its spec. Anything it does not recognise is ignored, which can only lose an edge, never invent one. */
export declare function parseCargoManifest(text: string): CargoManifest;
/** Does Rust source `text` declare an item called `name` (struct / enum / union / trait / type / fn / const / static / mod / macro_rules!), bind it with `extern crate` (the alias of `extern crate x as name;`, else the crate of `extern crate name;`), or bring it into scope with a `use`? */
export declare function rustFileDeclares(text: string, name: string, asItem?: boolean): boolean;
/** The module path declared by go.mod text: `module x`, `module "x"`, ``module `x` ``, or
 *  the block form `module ( x )`. The first declaration wins; undefined when there is none. */
export declare function parseGoModulePath(text: string): string | undefined;
/** The directories named by `use` directives in go.work text (single-line and block form,
 *  quoted or bare), as written — relative to the go.work directory. */
export declare function parseGoWorkUses(text: string): string[];
export {};
