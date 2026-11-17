import { type GrammarManifest } from './manifest.mjs';
/** The shipped grammars/ directory: the manifest, its schema and the patches. */
export declare function shippedGrammarsDir(): string;
/** Where the published package carries the built grammar files: `<wasmFile>` and its node-types.json for every pin. */
export declare function shippedGrammarFilesDir(): string;
/** The shipped grammar manifest, parsed and validated. */
export declare function loadGrammarManifest(): GrammarManifest;
export interface BuildGrammarsOptions {
    /** Where `<wasmFile>` and its node-types.json are written. Created when missing. */
    outDir: string;
    /** Language ids to build; every pin when absent. A name the manifest does not pin is an error. */
    only?: readonly string[];
    /** The manifest to build; the shipped one when absent. */
    manifest?: GrammarManifest;
    /** Directory the patch paths of the manifest are relative to; the shipped grammars/ when absent. */
    patchesRoot?: string;
    /** Directory whose node_modules hold the npm grammar packages and tree-sitter-cli (resolved as from a file in it). Default: the current directory. */
    resolveFrom?: string;
    /** The built grammar files read before any other source, each checked against its pin. Default: the `grammars/built/` the published package carries. */
    shippedDir?: string;
    /** The content-addressed cache. Default: `RUNES_GRAMMAR_CACHE`, else `~/.cache/runes/grammars`. */
    cacheDir?: string;
    /** Ignore the shipped files and the cache and re-derive every non-npm grammar (a reproducibility audit). */
    rebuild?: boolean;
    /** Forbid downloads and source builds: a grammar missing from the shipped files and the cache (and, for an npm pin, not installed) is an error. */
    offline?: boolean;
    /** Progress lines; silent when absent. */
    log?: (line: string) => void;
    /** The platform the recipe runs on; `process.platform` when absent. A source build is refused on `win32` (see the module comment). */
    platform?: NodeJS.Platform;
}
export interface BuiltGrammar {
    language: string;
    wasmFile: string;
    /** How the bytes were obtained: already in `outDir`, from the files the package ships, from the cache, from an npm package, downloaded, or built from source. */
    from: 'out' | 'shipped' | 'cache' | 'npm' | 'download' | 'source';
}
/**
 * Builds (or fetches, or copies) the pinned grammars into `outDir`, verified by sha256. The sources are tried in order: the files already in `outDir`, the files the package ships, then by the pin's kind the installed npm package, or the cache and then a download or a source build. Every requested grammar is materialized before anything is written, so a failing pin leaves no partial set behind. A grammar whose two files already sit in `outDir` with the pinned bytes is left as it is.
 */
export declare function buildGrammars(options: BuildGrammarsOptions): Promise<BuiltGrammar[]>;
export interface GrammarFileProblem {
    language: string;
    file: string;
    problem: 'missing' | 'mismatch';
    expected: string;
    actual?: string;
}
/**
 * Checks grammar files a consumer ships or loads against the manifest: every requested pin's WASM and node-types.json must exist in `dir` with the pinned sha256. Returns the problems; an empty list means the directory holds exactly the pinned bytes.
 */
export declare function verifyGrammarFiles(dir: string, options?: {
    only?: readonly string[];
    manifest?: GrammarManifest;
}): GrammarFileProblem[];
