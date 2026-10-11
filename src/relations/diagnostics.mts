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

/** Where a failure lies in a file as written; both fields are absent when no position could be found. */
export type Failure = { line?: number; column?: number };

/** The offset of the first character of `text` that cannot begin or continue any JSON token (a single-quoted string, an unquoted value, `undefined`, a misspelt literal, a string never closed), or undefined when every token is well formed. Structure (a missing colon or comma) is not judged: `JSON.parse` names a position for those itself. */
function firstBadTokenOffset(text: string): number | undefined {
  const token = /[\s{}[\],:]+|"(?:[^"\\\u0000-\u001f]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
  let at = 0;
  while (at < text.length) {
    token.lastIndex = at;
    const m = token.exec(text);
    if (m === null) return at;
    at += m[0].length;
  }
  return undefined;
}

/** Where `JSON.parse` failed on `text`: the offset its message names; the end of the text for an unexpected end of input; otherwise, because V8 names no position for an unexpected token where a value belongs, the first token of `text` that cannot be JSON. undefined when none of these finds a place: the diagnostic then carries no position rather than a wrong one. */
export function failureOffset(error: unknown, text: string): number | undefined {
  const message = error instanceof Error ? error.message : '';
  const m = /position (\d+)/.exec(message);
  if (m !== null) return Math.min(Number(m[1]), text.length);
  if (/end of JSON input/.test(message)) return text.length;
  return firstBadTokenOffset(text);
}

/** The failure of parsing `text` as strict JSON (no comments, as `JSON.parse` reads it; one leading byte order mark is skipped, as the readers do, and the position counts from after it, as an editor shows), or undefined when it parses. */
export function strictJsonFailure(text: string): Failure | undefined {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    JSON.parse(body);
    return undefined;
  } catch (error) {
    const at = failureOffset(error, body);
    return at === undefined ? {} : lineColumnAt(body, at);
  }
}

/** Reports `file` as unreadable at `at`, in the one wording every reader uses; with no position the file is reported without a line and column. */
export function reportUnreadable(sink: DiagnosticSink, file: string, at: Failure, what: string): void {
  if (at.line === undefined || at.column === undefined) sink(CONFIG_UNREADABLE, file, `${file} does not parse; ${what}`);
  else sink(CONFIG_UNREADABLE, file, `${file} does not parse (line ${at.line}, column ${at.column}); ${what}`, { line: at.line, column: at.column });
}
