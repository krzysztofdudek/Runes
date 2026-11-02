/** The code for a configuration file that was consulted and does not parse. */
export const CONFIG_UNREADABLE = 'config-unreadable';
/**
 * A sink that hands each `(code, file)` pair to `onDiagnostic` once, synchronously, however often resolution consults the file again. One sink belongs to one resolver instance, like the resolver's other caches. Without a callback there is no sink, and the resolvers do not describe a failure (they ask the parsers for no position).
 */
export function makeDiagnosticSink(onDiagnostic) {
    if (onDiagnostic === undefined)
        return undefined;
    const seen = new Set();
    return (code, file, message, at) => {
        const key = `${code}\0${file}`;
        if (seen.has(key))
            return;
        seen.add(key);
        onDiagnostic(at === undefined ? { code, file, message } : { code, file, line: at.line, column: at.column, message });
    };
}
/** The 1-based line and column of the character at `offset` of `text`; an offset past the end is the position after the last character. */
export function lineColumnAt(text, offset) {
    const end = Math.min(Math.max(offset, 0), text.length);
    let line = 1;
    let lineStart = 0;
    for (let i = 0; i < end; i++) {
        const c = text.charCodeAt(i);
        // A line ends at LF, at CR, and at CRLF (counted once, at its LF).
        if (c === 0x0d && text.charCodeAt(i + 1) === 0x0a)
            continue;
        if (c === 0x0a || c === 0x0d) {
            line++;
            lineStart = i + 1;
        }
    }
    return { line, column: end - lineStart + 1 };
}
/** The offset of the first character of `text` that cannot begin or continue any JSON token (a single-quoted string, an unquoted value, `undefined`, a misspelt literal (at the first letter that differs from the real word, as V8 stops), a string never closed, a whitespace character JSON does not allow), or undefined when every token is well formed. Structure (a missing colon or comma, a structural character where a value belongs) is not judged. Whitespace is exactly space, tab, LF and CR, as JSON defines it. */
function firstBadTokenOffset(text) {
    const token = /[ \t\n\r{}[\],:]+|"(?:[^"\\\u0000-\u001f]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
    let at = 0;
    while (at < text.length) {
        token.lastIndex = at;
        const m = token.exec(text);
        if (m === null)
            return literalStop(text, at, at > 0 && /[a-z]/.test(text[at - 1]));
        at += m[0].length;
    }
    return undefined;
}
const LITERALS = { t: 'true', f: 'false', n: 'null' };
/** Where V8 stops in a word that starts like `true`, `false` or `null`: at the first letter that differs from the real word (`ttrue` at its second letter, `foo` at its second, `faflse` at its third). Any other start, and a word that follows a complete literal, is the offset itself. */
function literalStop(text, at, afterLiteral) {
    const word = afterLiteral ? undefined : LITERALS[text[at]];
    if (word === undefined)
        return at;
    let k = 1;
    while (k < word.length && text[at + k] === word[k])
        k++;
    return at + k;
}
/** Where `JSON.parse` failed on `text`: the offset its message names (the message is read only where it ends in ` in JSON at position N`, so text quoted inside it cannot be mistaken for a position); the end of the text for the whole message "Unexpected end of JSON input"; for "Unexpected token 'X'", which names no position, the first token of `text` that cannot be JSON, but only when the character at that offset is the very one V8 quotes. undefined when none of these finds a place: the diagnostic then carries no position rather than a guessed one. */
export function failureOffset(error, text) {
    const message = error instanceof Error ? error.message : '';
    const m = /(?: in| after) JSON at position (\d+)(?: \(line \d+ column \d+\))?$/.exec(message);
    if (m !== null)
        return Math.min(Number(m[1]), text.length);
    if (message === 'Unexpected end of JSON input')
        return text.length;
    const quoted = /^Unexpected token '([^]+?)', /u.exec(message);
    if (quoted === null)
        return undefined;
    const at = firstBadTokenOffset(text);
    if (at === undefined || at >= text.length)
        return undefined;
    return String.fromCodePoint(text.codePointAt(at)) === quoted[1] ? at : undefined;
}
/** The failure of parsing `text` as strict JSON (no comments, as `JSON.parse` reads it; one leading byte order mark is skipped, as the readers do, and the position counts from after it, as an editor shows), or undefined when it parses. */
export function strictJsonFailure(text) {
    const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    try {
        JSON.parse(body);
        return undefined;
    }
    catch (error) {
        const at = failureOffset(error, body);
        return at === undefined ? {} : lineColumnAt(body, at);
    }
}
/** Reports `file` as unreadable at `at`, in the one wording every reader uses; with no position the file is reported without a line and column. */
export function reportUnreadable(sink, file, at, what) {
    if (at.line === undefined || at.column === undefined)
        sink(CONFIG_UNREADABLE, file, `${file} does not parse; ${what}`);
    else
        sink(CONFIG_UNREADABLE, file, `${file} does not parse (line ${at.line}, column ${at.column}); ${what}`, { line: at.line, column: at.column });
}
