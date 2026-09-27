/**
 * The one-block `--json` rule: a command asked for JSON prints exactly one JSON document on stdout and nothing else there, so a caller parses the whole of stdout at once. Its answer on success, its `<tool>-error/1` document on failure. Notes, progress and warnings go to stderr, in JSON mode and in text mode alike. `renderResult` and `renderFailure` build what to print; `emit` prints it.
 */
import { errorDocument, errorParts, formatError } from './error.mjs';

export interface CommandResult {
  /** What `--json` prints. */
  value?: unknown;
  /** What the command prints in text mode. */
  text?: string;
  /** Notes for stderr, one per entry. */
  notes?: readonly string[];
  /** Exit code; default 0. A command whose answer is a failed check (not a refusal) sets it. */
  exitCode?: number;
}

export interface Rendered {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const lines = (notes: readonly string[] | undefined): string => (notes && notes.length ? `${notes.join('\n')}\n` : '');

/** The JSON text of one document, as every family tool prints it: two-space indent and a final newline. */
export function jsonBlock(value: unknown): string {
  return `${JSON.stringify(value === undefined ? null : value, null, 2)}\n`;
}

/** A command's answer: the JSON document or the text on stdout, the notes on stderr. */
export function renderResult(result: CommandResult, options: { json: boolean }): Rendered {
  const stdout = options.json ? jsonBlock(result.value) : result.text ? `${result.text}\n` : '';
  return { stdout, stderr: lines(result.notes), exitCode: result.exitCode ?? 0 };
}

export interface FailureOptions {
  json: boolean;
  /** Names `next.command` may start with in the error document. Default the tool's name. */
  programs?: readonly string[];
  /** How the error reads on stderr. Default `formatError` (`error[code]: what`, why, next). */
  format?: (err: unknown) => string;
}

/** A refusal: the text on stderr always, and in JSON mode the `<tool>-error/1` document as the one block on stdout. */
export function renderFailure(tool: string, err: unknown, options: FailureOptions): Rendered {
  const text = (options.format ?? formatError)(err);
  return {
    stdout: options.json ? jsonBlock(errorDocument(tool, err, options.programs)) : '',
    stderr: text ? `${text.replace(/\n$/, '')}\n` : '',
    exitCode: errorParts(err).exitCode,
  };
}

/** Whether `stdout` is exactly one JSON document and nothing else (surrounding whitespace aside). */
export function isSingleJsonBlock(stdout: string): boolean {
  if (!stdout.trim()) return false;
  try { JSON.parse(stdout); return true; } catch { return false; }
}

export interface Streams {
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
}

/** Writes what was rendered and returns its exit code; the caller sets `process.exitCode` or exits. */
export function emit(rendered: Rendered, streams: Streams = process): number {
  if (rendered.stdout) streams.stdout.write(rendered.stdout);
  if (rendered.stderr) streams.stderr.write(rendered.stderr);
  return rendered.exitCode;
}
