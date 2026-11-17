import type { Point } from 'web-tree-sitter';

/** The 1-based line a node starts on, as an editor shows the file. */
export type LineOf = (node: { readonly startPosition: Point }) => number;

const rowLine: LineOf = (node) => node.startPosition.row + 1;

/**
 * How the extractors tell the line of a node of `content`. Tree-sitter counts rows by LF alone, so in a file whose lines end with a CR that no LF follows (old Mac line ends, or a file that mixes them in) a row is not the line an editor shows. For content with no such CR the line is the row plus one, as it always was; otherwise it is one more than the count of LF, CRLF and lone CR line ends before the node's start. U+2028, U+2029 and U+0085 end no line, as tree-sitter reads them.
 *
 * The start is read from the node's row and column (UTF-16 code units in web-tree-sitter, as a JavaScript string counts), never from its index: a Kotlin declaration re-parsed on its own carries the row and column it has in the file, and an index shifted by another padding.
 */
export function lineReader(content: string): LineOf {
  if (!/\r(?!\n)/.test(content)) return rowLine;
  const rowStarts = [0];
  const lineStarts = [0];
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    if (c === 10) {
      rowStarts.push(i + 1);
      lineStarts.push(i + 1);
    } else if (c === 13 && content.charCodeAt(i + 1) !== 10) {
      lineStarts.push(i + 1);
    }
  }
  return ({ startPosition: { row, column } }) => {
    const offset = rowStarts[row] + column;
    let lo = row;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}
