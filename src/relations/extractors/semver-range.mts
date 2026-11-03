/**
 * Whether a version satisfies a semver range, as node-semver's `satisfies(version, range, { loose: true })` answers it (the call npm's arborist, yarn and pnpm make when they decide whether a workspace package's version meets a dependency's range): `||` alternatives of space-separated comparators, `A - B` hyphen ranges, `^` and `~` (`~>`), x-ranges (`1.x`, `1.2.*`, `*`, the empty range) and the primitives `<`, `<=`, `>`, `>=` and `=`, desugared as node-semver's `replaceCaret`, `replaceTilde`, `replaceXRange` and `hyphenReplace` desugar them, and a version with a prerelease tag satisfying a set only when a comparator of that set has a prerelease on the same major, minor and patch. Loose reading takes a leading `v` or `=` and a prerelease written without its hyphen. A version that does not parse satisfies nothing; undefined when the range does not parse (a dist-tag such as `latest`, a URL, a protocol).
 */
export function satisfiesRange(version: string, range: string): boolean | undefined {
  const sets = parseRange(range);
  if (sets === undefined) return undefined;
  const v = parseVersion(version);
  if (v === undefined) return false;
  return sets.some((set) => testSet(set, v));
}

interface Version { major: number; minor: number; patch: number; pre: Array<string | number> }
type Op = '<' | '<=' | '>' | '>=' | '=';
/** A primitive comparator, or `undefined` for one that every version passes. */
type Comparator = { op: Op; v: Version } | undefined;

const IDENT = '[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*';
const PART = '(x|X|\\*|[0-9]+)';
const PARTIAL = new RegExp(`^[v=\\s]*${PART}(?:\\.${PART}(?:\\.${PART}(?:-?(${IDENT}))?(?:\\+${IDENT})?)?)?$`);
const VERSION = new RegExp(`^[v=\\s]*([0-9]+)\\.([0-9]+)\\.([0-9]+)(?:-?(${IDENT}))?(?:\\+${IDENT})?$`);

function prerelease(text: string | undefined): Array<string | number> {
  return text === undefined ? [] : text.split('.').map((id) => (/^[0-9]+$/.test(id) ? Number(id) : id));
}

function parseVersion(text: string): Version | undefined {
  const m = VERSION.exec(text.trim());
  return m === null ? undefined : { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: prerelease(m[4]) };
}

function compare(a: Version, b: Version): number {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core !== 0) return core;
  if (a.pre.length === 0 || b.pre.length === 0) return b.pre.length - a.pre.length;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    if (typeof x === 'number' || typeof y === 'number') return typeof x === 'number' ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

function passes(c: Comparator, v: Version): boolean {
  if (c === undefined) return true;
  const d = compare(v, c.v);
  return c.op === '<' ? d < 0 : c.op === '<=' ? d <= 0 : c.op === '>' ? d > 0 : c.op === '>=' ? d >= 0 : d === 0;
}

function testSet(set: Comparator[], v: Version): boolean {
  if (!set.every((c) => passes(c, v))) return false;
  if (v.pre.length === 0) return true;
  return set.some((c) => c !== undefined && c.v.pre.length > 0 && c.v.major === v.major && c.v.minor === v.minor && c.v.patch === v.patch);
}

/** A partial version: each of its three numbers, or undefined where it is an x (or absent). */
interface Partial { M?: number; m?: number; p?: number; pre: Array<string | number> }

function parsePartial(text: string): Partial | undefined {
  const m = PARTIAL.exec(text);
  if (m === null) return undefined;
  const num = (s: string | undefined): number | undefined => (s === undefined || /^[xX*]$/.test(s) ? undefined : Number(s));
  const M = num(m[1]);
  const mi = M === undefined ? undefined : num(m[2]);
  const p = mi === undefined ? undefined : num(m[3]);
  return { M, m: mi, p, pre: p === undefined ? [] : prerelease(m[4]) };
}

const ver = (major: number, minor: number, patch: number, pre: Array<string | number> = []): Version => ({ major, minor, patch, pre });
const ZERO = [0];

/** One comparator token (`^1.2`, `>=1.x`, `~1.2.3-beta`, `1.2`), desugared to primitives; undefined when it does not parse. */
function desugar(token: string): Comparator[] | undefined {
  const at = /^(<=|>=|<|>|~>|~|\^|=)?(.*)$/.exec(token)!;
  const op = at[1] ?? '';
  const part = parsePartial(at[2]);
  if (part === undefined) return undefined;
  const { M, m, p, pre } = part;
  if (op === '~' || op === '~>') {
    if (M === undefined) return [undefined];
    if (m === undefined) return [{ op: '>=', v: ver(M, 0, 0) }, { op: '<', v: ver(M + 1, 0, 0, ZERO) }];
    return [{ op: '>=', v: ver(M, m, p ?? 0, pre) }, { op: '<', v: ver(M, m + 1, 0, ZERO) }];
  }
  if (op === '^') {
    if (M === undefined) return [undefined];
    if (m === undefined) return [{ op: '>=', v: ver(M, 0, 0) }, { op: '<', v: ver(M + 1, 0, 0, ZERO) }];
    const low: Comparator = { op: '>=', v: ver(M, m, p ?? 0, pre) };
    if (M !== 0) return [low, { op: '<', v: ver(M + 1, 0, 0, ZERO) }];
    if (p === undefined || m !== 0) return [low, { op: '<', v: ver(0, m + 1, 0, ZERO) }];
    return [low, { op: '<', v: ver(0, 0, p + 1, ZERO) }];
  }
  const gtlt = op === '=' ? '' : op;
  if (M === undefined) return gtlt === '>' || gtlt === '<' ? [{ op: '<', v: ver(0, 0, 0, ZERO) }] : [undefined];
  if (m !== undefined && p !== undefined) return [{ op: gtlt === '' ? '=' : (gtlt as Op), v: ver(M, m, p, pre) }];
  // An x in the minor or the patch.
  if (gtlt === '') return m === undefined ? [{ op: '>=', v: ver(M, 0, 0) }, { op: '<', v: ver(M + 1, 0, 0, ZERO) }] : [{ op: '>=', v: ver(M, m, 0) }, { op: '<', v: ver(M, m + 1, 0, ZERO) }];
  const next = m === undefined ? ver(M + 1, 0, 0) : ver(M, m + 1, 0);
  if (gtlt === '>') return [{ op: '>=', v: next }];
  if (gtlt === '<=') return [{ op: '<', v: { ...next, pre: ZERO } }];
  if (gtlt === '<') return [{ op: '<', v: ver(M, m ?? 0, 0, ZERO) }];
  return [{ op: '>=', v: ver(M, m ?? 0, 0) }];
}

/** The hyphen range `from - to`, desugared as node-semver's `hyphenReplace`. */
function hyphen(fromText: string, toText: string): Comparator[] | undefined {
  const from = parsePartial(fromText);
  const to = parsePartial(toText);
  if (from === undefined || to === undefined) return undefined;
  const out: Comparator[] = [];
  if (from.M !== undefined) out.push({ op: '>=', v: ver(from.M, from.m ?? 0, from.p ?? 0, from.pre) });
  if (to.M !== undefined) {
    if (to.m === undefined) out.push({ op: '<', v: ver(to.M + 1, 0, 0, ZERO) });
    else if (to.p === undefined) out.push({ op: '<', v: ver(to.M, to.m + 1, 0, ZERO) });
    else out.push({ op: '<=', v: ver(to.M, to.m, to.p, to.pre) });
  }
  return out.length === 0 ? [undefined] : out;
}

function parseRange(range: string): Comparator[][] | undefined {
  const sets: Comparator[][] = [];
  for (const alternative of range.trim().split(/\s*\|\|\s*/)) {
    const dash = /^(\S+)\s+-\s+(\S+)$/.exec(alternative.trim());
    if (dash !== null) {
      const set = hyphen(dash[1], dash[2]);
      if (set === undefined) return undefined;
      sets.push(set);
      continue;
    }
    const tokens = alternative.replace(/(<=|>=|<|>|~>|~|\^|=)\s+/g, '$1').split(/\s+/).filter((t) => t !== '');
    const set: Comparator[] = [];
    for (const token of tokens) {
      const comparators = desugar(token);
      if (comparators === undefined) return undefined;
      set.push(...comparators);
    }
    sets.push(set.length === 0 ? [undefined] : set);
  }
  return sets;
}
