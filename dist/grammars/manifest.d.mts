/**
 * The grammar manifest: exact pins for the tree-sitter runtime and for each grammar, with the sha256 of the built WASM and its node-types.json. Runes keeps the recipe and the pins, never the grammar bytes. The JSON Schema in grammars/manifest.schema.json describes the same shape for editors; this validator is what tests and consumers run, because Runes has no runtime dependencies to run a schema engine with.
 */
export declare const GRAMMAR_MANIFEST_SCHEMA = "runes-grammars/1";
export type GrammarSource = {
    kind: 'npm';
    package: string;
    version: string;
    path: string;
} | {
    kind: 'github-release';
    repo: string;
    tag: string;
    asset: string;
} | {
    kind: 'git';
    repo: string;
    commit: string;
    subdir?: string;
};
export interface GrammarPin {
    /** Language id, unique in the manifest. */
    language: string;
    /** File name the parser resolves, unique in the manifest. */
    wasmFile: string;
    source: GrammarSource;
    sha256: {
        wasm: string;
        nodeTypes: string;
    };
    /** Patches applied before a source build, relative to grammars/. */
    patches?: string[];
}
export interface GrammarManifest {
    schema: typeof GRAMMAR_MANIFEST_SCHEMA;
    /** The runtime every consumer must load, at exactly this version. */
    runtime: {
        package: 'web-tree-sitter';
        version: string;
    };
    grammars: GrammarPin[];
}
/** Returns every problem with a parsed manifest; an empty list means it is valid. */
export declare function validateGrammarManifest(value: unknown): string[];
/** Parses and validates manifest text; throws with every problem listed. */
export declare function parseGrammarManifest(text: string): GrammarManifest;
