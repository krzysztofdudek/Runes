import type { Point } from 'web-tree-sitter';
/** The 1-based line a node starts on, as an editor shows the file. */
export type LineOf = (node: {
    readonly startPosition: Point;
}) => number;
/** The row plus one: the line where every line ends with an LF or a CRLF. */
export declare const rowLine: LineOf;
/**
 * How the extractors tell the line of a node of `content`. Tree-sitter counts rows by LF alone, so in a file whose lines end with a CR that no LF follows (old Mac line ends, or a file that mixes them in) a row is not the line an editor shows. For content with no such CR the line is the row plus one, as it always was; otherwise it is one more than the count of LF, CRLF and lone CR line ends before the node's start. U+2028, U+2029 and U+0085 end no line, as tree-sitter reads them.
 *
 * The start is read from the node's row and column (UTF-16 code units in web-tree-sitter, as a JavaScript string counts), never from its index: a Kotlin declaration re-parsed on its own carries the row and column it has in the file, and an index shifted by another padding.
 */
export declare function lineReader(content: string): LineOf;
