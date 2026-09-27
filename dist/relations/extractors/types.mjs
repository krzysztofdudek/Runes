/** Wrap one hint as a one-element ordered candidate group. */
export function single(hint, kind, line) {
    return { candidates: [hint], kind, line };
}
