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
/** Where a failure lies in a file as written; both fields are absent when no position could be found. */
export type Failure = {
    line?: number;
    column?: number;
};
/** Where `JSON.parse` failed on `text`: the offset its message names; the end of the text for an unexpected end of input; otherwise, because V8 names no position for an unexpected token where a value belongs, the first token of `text` that cannot be JSON. undefined when none of these finds a place: the diagnostic then carries no position rather than a wrong one. */
export declare function failureOffset(error: unknown, text: string): number | undefined;
/** The failure of parsing `text` as strict JSON (no comments, as `JSON.parse` reads it; one leading byte order mark is skipped, as the readers do, and the position counts from after it, as an editor shows), or undefined when it parses. */
export declare function strictJsonFailure(text: string): Failure | undefined;
/** Reports `file` as unreadable at `at`, in the one wording every reader uses; with no position the file is reported without a line and column. */
export declare function reportUnreadable(sink: DiagnosticSink, file: string, at: Failure, what: string): void;
