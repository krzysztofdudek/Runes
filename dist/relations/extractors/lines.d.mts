import type { Point } from 'web-tree-sitter';
/** Where a node starts: its index in the file's text and its row and column there. */
export interface Start {
    readonly startIndex: number;
    readonly startPosition: Point;
}
/** The 1-based line a node starts on, as an editor shows the file. */
export type LineOf = (node: Start) => number;
/** The row plus one: the line where every line ends with an LF or a CRLF. */
export declare const rowLine: LineOf;
/**
 * How the extractors tell the line of a node of `content`. Tree-sitter counts rows by LF alone, so in a file whose lines end with a CR that no LF follows (old Mac line ends, or a file that mixes them in) a row is not the line an editor shows. For content with no such CR the line is the row plus one, as it always was; otherwise it is one more than the count of LF, CRLF and lone CR line ends before the node's index. U+2028, U+2029 and U+0085 end no line, as tree-sitter reads them.
 *
 * The index counts UTF-16 code units in web-tree-sitter, as a JavaScript string does. A tree parsed from a rewrite of the file that keeps its length (a Kotlin view, a component's script view) has the file's indexes, though its rows may start elsewhere than the file's.
 */
export declare function lineReader(content: string): LineOf;
