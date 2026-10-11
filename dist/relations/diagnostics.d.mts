/** A fact about the repository that resolution met and that explains an absence of edges: a configuration file it consulted and could not read. Delivered through `ResolvePathOptions.onDiagnostic`. */
export interface RelationDiagnostic {
    /** A stable code, a string rather than a union so a later minor can add one. Today `config-unreadable`. */
    code: string;
    /** The repository-relative POSIX path of the file the diagnostic is about. */
    file: string;
    /** The 1-based line of the failure in the file as written, when known. Best effort, not part of the promise. */
    line?: number;
    /** The 1-based column of the failure in the file as written, when known. Best effort, not part of the promise. */
    column?: number;
    /** A sentence for a person. Best effort, not part of the promise. */
    message: string;
}
/** Reports one diagnostic; made by {@link makeDiagnosticSink}. */
export type DiagnosticSink = (code: string, file: string, message: string, offset?: {
    line: number;
    column: number;
}) => void;
/** The code for a configuration file that was consulted and does not parse. */
export declare const CONFIG_UNREADABLE = "config-unreadable";
/**
 * A sink that hands each `(code, file)` pair to `onDiagnostic` once, synchronously, however often resolution consults the file again. One sink belongs to one resolver instance, like the resolver's other caches. Without a callback there is no sink, and the resolvers skip the work of describing a failure.
 */
export declare function makeDiagnosticSink(onDiagnostic: ((d: RelationDiagnostic) => void) | undefined): DiagnosticSink | undefined;
/** The 1-based line and column of the character at `offset` of `text`; an offset past the end is the position after the last character. */
export declare function lineColumnAt(text: string, offset: number): {
    line: number;
    column: number;
};
/** Where `JSON.parse` says it failed: the offset its message names; an unexpected end of input names none and is at the end of the text; any other message without a position is at the start. */
export declare function failureOffset(error: unknown, textLength: number): number;
/** The failure of parsing `text` as strict JSON (no comments, as `JSON.parse` reads it; one leading byte order mark is skipped, as the readers do), or undefined when it parses. */
export declare function strictJsonFailure(text: string): {
    line: number;
    column: number;
} | undefined;
/** Reports `file` as unreadable at `at`, in the one wording every reader uses. */
export declare function reportUnreadable(sink: DiagnosticSink, file: string, at: {
    line: number;
    column: number;
}, what: string): void;
