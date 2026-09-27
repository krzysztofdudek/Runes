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
 *  crate declares it, so it gets the `tests/` tree with no root file to bind items to. */
export declare function rustTargetFor(rel: string, existsInPackage: (sub: string) => boolean, libPath?: string): {
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
    dependencies: Map<string, CargoDependencySpec>;
    workspaceDependencies: Map<string, CargoDependencySpec>;
}
/** A minimal, line-oriented Cargo.toml reader: `[package].name`, `[lib].name` / `.path`,
 *  and the path / package / workspace fields of dependency entries (inline tables and the
 *  `[dependencies.<name>]` table form) plus `[workspace.dependencies]`. Anything it does
 *  not recognise is ignored, which can only lose an edge, never invent one. */
export declare function parseCargoManifest(text: string): CargoManifest;
/** Does Rust source `text` declare an item called `name` (struct / enum / union / trait /
 *  type / fn / const / static / mod / macro_rules!) or bring it into scope with a `use`? */
export declare function rustFileDeclares(text: string, name: string): boolean;
/** The module path declared by go.mod text: `module x`, `module "x"`, ``module `x` ``, or
 *  the block form `module ( x )`. The first declaration wins; undefined when there is none. */
export declare function parseGoModulePath(text: string): string | undefined;
/** The directories named by `use` directives in go.work text (single-line and block form,
 *  quoted or bare), as written — relative to the go.work directory. */
export declare function parseGoWorkUses(text: string): string[];
export {};
