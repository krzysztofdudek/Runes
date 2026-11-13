/**
 * Whether the TypeScript Runes models satisfies the range a package.json `exports` key `types@<range>` names, as the compiler decides it (`isApplicableVersionedTypesKey` reading its own `VersionRange`): `||` alternatives of space-separated comparators, `A - B` hyphen ranges, `~` and `^`, x-ranges and the primitives `<`, `<=`, `>`, `>=` and `=`, with prerelease tags counting as they do in `satisfies(..., { includePrerelease: true })`. A range the compiler does not parse (an operator separated from its version by a space, a version of four parts, any word) satisfies nothing, which is what makes the compiler skip the key. The empty range satisfies every version.
 *
 * Runes does not run the compiler and does not read which one a project uses: the version is TypeScript 7, the one the family pins and the catalogue cites, for every project (the owner's ruling for Runes 1.1.0).
 */
export const MODELLED_TYPESCRIPT_VERSION = '7.0.2';
export function typeScriptSatisfies(range) {
    const alternatives = parseRange(range);
    if (alternatives === undefined)
        return false;
    const version = parseVersion(MODELLED_TYPESCRIPT_VERSION);
    if (version === undefined || alternatives.length === 0)
        return true;
    return alternatives.some((comparators) => comparators.every((c) => test(version, c)));
}
const VERSION = /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*)(?:-([a-z0-9-.]+))?(?:\+([a-z0-9-.]+))?)?)?$/i;
const PARTIAL = /^([x*0]|[1-9]\d*)(?:\.([x*0]|[1-9]\d*)(?:\.([x*0]|[1-9]\d*)(?:-([a-z0-9-.]+))?(?:\+([a-z0-9-.]+))?)?)?$/i;
const HYPHEN = /^\s*([a-z0-9-+.*]+)\s+-\s+([a-z0-9-+.*]+)\s*$/i;
const SIMPLE = /^([~^<>=]|<=|>=)?\s*([a-z0-9-+.*]+)$/i;
const PRERELEASE_PART = /^(?:0|[1-9]\d*|[a-z-][a-z0-9-]*)$/i;
const BUILD_PART = /^[a-z0-9-]+$/i;
function makeVersion(major, minor, patch, prerelease, build) {
    const parts = prerelease === undefined || prerelease === '' ? [] : prerelease.split('.');
    if (!parts.every((p) => PRERELEASE_PART.test(p)))
        return undefined;
    if (build !== undefined && build !== '' && !build.split('.').every((p) => BUILD_PART.test(p)))
        return undefined;
    return { major, minor, patch, prerelease: parts };
}
function parseVersion(text) {
    const m = VERSION.exec(text);
    if (m === null)
        return undefined;
    return makeVersion(parseInt(m[1], 10), parseInt(m[2] ?? '0', 10), parseInt(m[3] ?? '0', 10), m[4], m[5]);
}
const isWildcard = (part) => part === '*' || part === 'x' || part === 'X';
function withPrerelease(v, prerelease) {
    return { ...v, prerelease };
}
function increment(v, field) {
    if (field === 'major')
        return { major: v.major + 1, minor: 0, patch: 0, prerelease: [] };
    if (field === 'minor')
        return { major: v.major, minor: v.minor + 1, patch: 0, prerelease: [] };
    return { major: v.major, minor: v.minor, patch: v.patch + 1, prerelease: [] };
}
function parsePartial(text) {
    const m = PARTIAL.exec(text);
    if (m === null)
        return undefined;
    const major = m[1];
    const minor = m[2] ?? '*';
    const patch = m[3] ?? '*';
    const version = makeVersion(isWildcard(major) ? 0 : parseInt(major, 10), isWildcard(major) || isWildcard(minor) ? 0 : parseInt(minor, 10), isWildcard(major) || isWildcard(minor) || isWildcard(patch) ? 0 : parseInt(patch, 10), m[4], m[5]);
    return version === undefined ? undefined : { version, major, minor, patch };
}
function parseHyphen(left, right, out) {
    const l = parsePartial(left);
    if (l === undefined)
        return false;
    const r = parsePartial(right);
    if (r === undefined)
        return false;
    if (!isWildcard(l.major))
        out.push({ operator: '>=', operand: l.version });
    if (!isWildcard(r.major)) {
        out.push(isWildcard(r.minor)
            ? { operator: '<', operand: increment(r.version, 'major') }
            : isWildcard(r.patch)
                ? { operator: '<', operand: increment(r.version, 'minor') }
                : { operator: '<=', operand: r.version });
    }
    return true;
}
function parseComparator(operator, text, out) {
    const p = parsePartial(text);
    if (p === undefined)
        return false;
    const { version, major, minor, patch } = p;
    if (!isWildcard(major)) {
        switch (operator) {
            case '~':
                out.push({ operator: '>=', operand: version }, { operator: '<', operand: increment(version, isWildcard(minor) ? 'major' : 'minor') });
                break;
            case '^':
                out.push({ operator: '>=', operand: version }, { operator: '<', operand: increment(version, version.major > 0 || isWildcard(minor) ? 'major' : version.minor > 0 || isWildcard(patch) ? 'minor' : 'patch') });
                break;
            case '<':
            case '>=':
                out.push({ operator, operand: isWildcard(minor) || isWildcard(patch) ? withPrerelease(version, ['0']) : version });
                break;
            case '<=':
            case '>':
                out.push(isWildcard(minor)
                    ? { operator: operator === '<=' ? '<' : '>=', operand: withPrerelease(increment(version, 'major'), ['0']) }
                    : isWildcard(patch)
                        ? { operator: operator === '<=' ? '<' : '>=', operand: withPrerelease(increment(version, 'minor'), ['0']) }
                        : { operator, operand: version });
                break;
            default:
                if (isWildcard(minor) || isWildcard(patch)) {
                    out.push({ operator: '>=', operand: withPrerelease(version, ['0']) }, { operator: '<', operand: withPrerelease(increment(version, isWildcard(minor) ? 'major' : 'minor'), ['0']) });
                }
                else
                    out.push({ operator: '=', operand: version });
        }
    }
    else if (operator === '<' || operator === '>') {
        out.push({ operator: '<', operand: { major: 0, minor: 0, patch: 0, prerelease: [] } });
    }
    return true;
}
function parseRange(text) {
    const alternatives = [];
    for (const raw of text.trim().split(/\|\|/)) {
        if (raw === '')
            continue;
        const range = raw.trim();
        const comparators = [];
        const hyphen = HYPHEN.exec(range);
        if (hyphen !== null) {
            if (!parseHyphen(hyphen[1], hyphen[2], comparators))
                return undefined;
        }
        else {
            for (const simple of range.split(/\s+/)) {
                const m = SIMPLE.exec(simple.trim());
                if (m === null || !parseComparator(m[1], m[2], comparators))
                    return undefined;
            }
        }
        alternatives.push(comparators);
    }
    return alternatives;
}
/** The modelled version has no prerelease tag, so it follows every operand of the same major, minor and patch that has one. */
function compare(version, operand) {
    return Math.sign(version.major - operand.major) || Math.sign(version.minor - operand.minor) || Math.sign(version.patch - operand.patch) || (operand.prerelease.length > 0 ? 1 : 0);
}
function test(version, { operator, operand }) {
    const c = compare(version, operand);
    switch (operator) {
        case '<':
            return c < 0;
        case '<=':
            return c <= 0;
        case '>':
            return c > 0;
        case '>=':
            return c >= 0;
        case '=':
            return c === 0;
    }
}
