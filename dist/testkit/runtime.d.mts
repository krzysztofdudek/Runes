/**
 * A consumer's syntax-tree runtime against the grammar manifest's pin: the grammars are built for one `web-tree-sitter` version, and a consumer that declares or installs another one parses with a runtime the grammars were never checked against.
 */
export interface RuntimePinInput {
    /** The grammar manifest (its `runtime` entry is read). */
    manifest: {
        runtime: {
            package: string;
            version: string;
        };
    };
    /** The consumer's package.json, parsed. */
    packageJson?: {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
    };
    /** The version actually installed (from node_modules/<package>/package.json), when known. */
    installed?: string | null;
}
/** Every way the consumer departs from the pin: a declared range instead of the exact version, another version, or an installed version that differs. Empty means it matches. */
export declare function runtimePinProblems(input: RuntimePinInput): string[];
