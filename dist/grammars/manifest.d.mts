/**
 * The grammar manifest: exact pins for the tree-sitter runtime, the tree-sitter CLI that builds grammars from source, and each grammar, with the sha256 of the built WASM and its node-types.json. Runes keeps the recipe and the pins, never the grammar bytes. The JSON Schema in grammars/manifest.schema.json describes the same shape for editors; this validator is what tests and consumers run, because Runes has no runtime dependencies to run a schema engine with.
 */
export declare const GRAMMAR_MANIFEST_SCHEMA = "runes-grammars/1";
/**
 * Where a grammar's two files come from.
 *
 * - `npm`: the prebuilt WASM and node-types.json inside an npm package, exactly as published. The installed package version must equal `version`.
 * - `github-release`: a WASM asset of an upstream GitHub release that never reached npm, downloaded from `url`. node-types.json is read from the pin's `repo` at its `commit`.
 * - `source`: built from the pin's `repo` at its `commit` with the manifest's tree-sitter CLI. `dir` is the grammar directory inside the repository; `generate` regenerates parser.c from grammar.js first (needed when patches change the grammar); `patches` are applied in order, as paths relative to grammars/; `deps` are other grammar repositories checked out at a pinned commit under `path` (a grammar.js that `require`s another one).
 */
export type GrammarSource = {
    kind: 'npm';
    package: string;
    version: string;
    wasmPath: string;
    nodeTypesPath: string;
} | {
    kind: 'github-release';
    url: string;
} | {
    kind: 'source';
    dir: string;
    generate: boolean;
    patches?: string[];
    deps?: Array<{
        path: string;
        repo: string;
        commit: string;
    }>;
};
export interface GrammarPin {
    /** Language id, unique in the manifest. */
    language: string;
    /** File name the grammar is written under and the parser loads, unique in the manifest. Its node-types.json is written beside it as `<name>.node-types.json`. */
    wasmFile: string;
    /** Upstream repository. Required for `github-release` and `source`. */
    repo?: string;
    /** 40-hex commit of `repo` the WASM was built from (the release tag's commit for a release). Required for `github-release` and `source`. */
    commit?: string;
    /** Human-readable version: the release, or which unreleased commit it is. */
    version?: string;
    /** The tree-sitter CLI that produced the WASM: exact (and equal to the manifest's `cli.version`) for source builds, the upstream's declared range for prebuilt ones. */
    cli?: string;
    /** Parser ABI the loaded language reports. */
    abi?: number;
    source: GrammarSource;
    sha256: {
        wasm: string;
        nodeTypes: string;
    };
    /** Why this pin is what it is, when that is not obvious from the fields. */
    note?: string;
}
export interface GrammarManifest {
    schema: typeof GRAMMAR_MANIFEST_SCHEMA;
    /** The runtime every consumer must load, at exactly this version, with the sha256 of its `web-tree-sitter.wasm`: the version names the release, the hash proves the engine bytes. */
    runtime: {
        package: 'web-tree-sitter';
        version: string;
        wasmSha256: string;
    };
    /** The tree-sitter CLI every `source` grammar is built with, at exactly this version. */
    cli: {
        package: 'tree-sitter-cli';
        version: string;
    };
    grammars: GrammarPin[];
}
/** Returns every problem with a parsed manifest; an empty list means it is valid. */
export declare function validateGrammarManifest(value: unknown): string[];
/** Parses and validates manifest text; throws with every problem listed. */
export declare function parseGrammarManifest(text: string): GrammarManifest;
/** The node-types.json file name written beside a grammar's WASM: `tree-sitter-go.wasm` gives `tree-sitter-go.node-types.json`. */
export declare function syntaxNodeTypesFile(wasmFile: string): string;
