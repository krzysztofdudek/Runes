/** The row plus one: the line where every line ends with an LF or a CRLF. */
export const rowLine = (node) => node.startPosition.row + 1;
/**
 * How the extractors tell the line of a node of `content`. Tree-sitter counts rows by LF alone, so in a file whose lines end with a CR that no LF follows (old Mac line ends, or a file that mixes them in) a row is not the line an editor shows. For content with no such CR the line is the row plus one, as it always was; otherwise it is one more than the count of LF, CRLF and lone CR line ends before the node's index. U+2028, U+2029 and U+0085 end no line, as tree-sitter reads them.
 *
 * The index counts UTF-16 code units in web-tree-sitter, as a JavaScript string does. A tree parsed from a rewrite of the file that keeps its length (a Kotlin view, a component's script view) has the file's indexes, though its rows may start elsewhere than the file's.
 */
export function lineReader(content) {
    if (!/\r(?!\n)/.test(content))
        return rowLine;
    const lineStarts = [0];
    for (let i = 0; i < content.length; i++) {
        const c = content.charCodeAt(i);
        if (c === 10 || (c === 13 && content.charCodeAt(i + 1) !== 10))
            lineStarts.push(i + 1);
    }
    return ({ startIndex }) => {
        let lo = 0;
        let hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= startIndex)
                lo = mid;
            else
                hi = mid - 1;
        }
        return lo + 1;
    };
}
