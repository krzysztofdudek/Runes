/** The code for a configuration file that was consulted and does not parse. */
export const CONFIG_UNREADABLE = 'config-unreadable';
/**
 * A sink that hands each `(code, file)` pair to `onDiagnostic` once, synchronously, however often resolution consults the file again. One sink belongs to one resolver instance, like the resolver's other caches. Without a callback there is no sink, and the resolvers skip the work of describing a failure.
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
    for (let i = text.indexOf('\n'); i !== -1 && i < end; i = text.indexOf('\n', i + 1)) {
        line++;
        lineStart = i + 1;
    }
    return { line, column: end - lineStart + 1 };
}
/** Where `JSON.parse` says it failed: the offset its message names; an unexpected end of input names none and is at the end of the text; any other message without a position is at the start. */
export function failureOffset(error, textLength) {
    const message = error instanceof Error ? error.message : '';
    const m = /position (\d+)/.exec(message);
    if (m !== null)
        return Math.min(Number(m[1]), textLength);
    return /end of JSON input/.test(message) ? textLength : 0;
}
/** The failure of parsing `text` as strict JSON (no comments, as `JSON.parse` reads it; one leading byte order mark is skipped, as the readers do), or undefined when it parses. */
export function strictJsonFailure(text) {
    const skip = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    const body = text.slice(skip);
    try {
        JSON.parse(body);
        return undefined;
    }
    catch (error) {
        return lineColumnAt(text, skip + failureOffset(error, body.length));
    }
}
/** Reports `file` as unreadable at `at`, in the one wording every reader uses. */
export function reportUnreadable(sink, file, at, what) {
    sink(CONFIG_UNREADABLE, file, `${file} does not parse (line ${at.line}, column ${at.column}); ${what}`, at);
}
