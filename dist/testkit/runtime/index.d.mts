import type { GrammarManifest } from '../../grammars/manifest.mjs';
export interface RuntimePinOptions {
    /** Directory the packages are resolved from, as from a file in it (usually the consumer's package root). */
    resolveFrom: string;
    /** The manifest to check against; the shipped one when absent. */
    manifest?: GrammarManifest;
    /** Languages whose npm grammar packages must be installed at their pinned version; every npm-sourced pin when absent. */
    languages?: readonly string[];
    /** Also check tree-sitter-cli, which a consumer needs only when it builds grammars from source. */
    cli?: boolean;
    /** Versions known without resolving, by package name: a vendored runtime, for example, whose version is recorded beside the copy. */
    versions?: Readonly<Record<string, string>>;
    /** The runtime's `web-tree-sitter.wasm` to hash against the manifest; by default the one in the installed web-tree-sitter package. A vendored runtime passes its copy. */
    runtimeWasm?: string;
}
export interface RuntimePinProblem {
    package: string;
    /** What needs it: `runtime`, `runtime wasm` (the engine bytes, whose `expected` and `installed` are sha256), `cli`, or the grammar's language id. */
    role: string;
    expected: string;
    /** The installed version; absent when the package is not installed. */
    installed?: string;
}
/** Every package whose installed version differs from the manifest's pin, or that is missing, and the runtime WASM when its sha256 differs from the pin. An empty list means the consumer runs the pinned runtime and grammar packages. */
export declare function checkRuntimePins(options: RuntimePinOptions): RuntimePinProblem[];
/** One line per problem, for an assertion message. */
export declare function formatRuntimePinReport(problems: readonly RuntimePinProblem[]): string;
