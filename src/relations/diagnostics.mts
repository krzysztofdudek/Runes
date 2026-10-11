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
export type DiagnosticSink = (code: string, file: string, message: string, offset?: { line: number; column: number }) => void;

/** The code for a configuration file that was consulted and does not parse. */
export const CONFIG_UNREADABLE = 'config-unreadable';

/**
 * A sink that hands each `(code, file)` pair to `onDiagnostic` once, synchronously, however often resolution consults the file again. One sink belongs to one resolver instance, like the resolver's other caches. Without a callback there is no sink, and the resolvers skip the work of describing a failure.
 */
export function makeDiagnosticSink(onDiagnostic: ((d: RelationDiagnostic) => void) | undefined): DiagnosticSink | undefined {
  if (onDiagnostic === undefined) return undefined;
  const seen = new Set<string>();
  return (code, file, message, at) => {
    const key = `${code}\0${file}`;
    if (seen.has(key)) return;
    seen.add(key);
    onDiagnostic(at === undefined ? { code, file, message } : { code, file, line: at.line, column: at.column, message });
  };
}

/** The 1-based line and column of the character at `offset` of `text`; an offset past the end is the position after the last character. */
export function lineColumnAt(text: string, offset: number): { line: number; column: number } {
  const end = Math.min(Math.max(offset, 0), text.length);
  let line = 1;
  let lineStart = 0;
  for (let i = text.indexOf('\n'); i !== -1 && i < end; i = text.indexOf('\n', i + 1)) {
    line++;
    lineStart = i + 1;
  }
  return { line, column: end - lineStart + 1 };
}

/** Where `JSON.parse` says it failed: the offset its message names, else the end of the text (an unexpected end of input names none). */
export function failureOffset(error: unknown, textLength: number): number {
  const m = /position (\d+)/.exec(error instanceof Error ? error.message : '');
  return m === null ? textLength : Math.min(Number(m[1]), textLength);
}

/** The failure of parsing `text` as strict JSON (no comments, no byte order mark, as `JSON.parse` reads it), or undefined when it parses. */
export function strictJsonFailure(text: string): { line: number; column: number } | undefined {
  try {
    JSON.parse(text);
    return undefined;
  } catch (error) {
    return lineColumnAt(text, failureOffset(error, text.length));
  }
}

/** Reports `file` as unreadable at `at`, in the one wording every reader uses. */
export function reportUnreadable(sink: DiagnosticSink, file: string, at: { line: number; column: number }, what: string): void {
  sink(CONFIG_UNREADABLE, file, `${file} does not parse (line ${at.line}, column ${at.column}); ${what}`, at);
}
