// A small `expect` over node:assert with the matchers the relation tests use, so the suites moved from Yggdrasil (written for vitest) run on node:test unchanged in shape. Semantics follow vitest: toEqual ignores properties whose value is undefined and accepts the asymmetric matchers objectContaining and arrayContaining; toMatchObject checks a recursive subset.
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe as nodeDescribe, it as nodeIt, beforeEach, afterEach } from 'node:test';

const ASYM = Symbol('asymmetric');

function asymmetric(name, sample, test) {
  return { [ASYM]: true, name, sample, test, [inspect.custom]: () => `${name}(${inspect(sample, { depth: 6 })})` };
}
const isAsym = (v) => v !== null && typeof v === 'object' && v[ASYM] === true;
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Set) && !(v instanceof Map) && !(v instanceof Date) && !(v instanceof RegExp);

export function equals(a, b) {
  if (isAsym(b)) return b.test(a);
  if (isAsym(a)) return a.test(b);
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => equals(x, b[i]));
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set) || a.size !== b.size) return false;
    const rest = [...b];
    for (const x of a) {
      const i = rest.findIndex((y) => equals(x, y));
      if (i === -1) return false;
      rest.splice(i, 1);
    }
    return true;
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map && b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !equals(v, b.get(k))) return false;
    return true;
  }
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (a instanceof RegExp || b instanceof RegExp) return String(a) === String(b);
  const keys = (o) => Object.keys(o).filter((k) => o[k] !== undefined);
  const ka = keys(a);
  const kb = keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && equals(a[k], b[k]));
}

function matchesObject(actual, expected) {
  if (isAsym(expected)) return expected.test(actual);
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => matchesObject(actual[i], e));
  if (isPlain(expected)) {
    if (actual === null || typeof actual !== 'object') return false;
    return Object.keys(expected).every((k) => k in actual && matchesObject(actual[k], expected[k]));
  }
  return equals(actual, expected);
}

const show = (v) => inspect(v, { depth: 8, maxArrayLength: 200 });

function contains(actual, item) {
  if (typeof actual === 'string') return actual.includes(item);
  if (actual !== null && typeof actual === 'object' && typeof actual[Symbol.iterator] === 'function') {
    for (const x of actual) if (x === item) return true;
    return false;
  }
  throw new TypeError(`toContain: ${show(actual)} is not a string or an iterable`);
}

function makeMatchers(actual, message, negate) {
  const check = (pass, text) => {
    if (pass === negate) assert.fail(`${message ? `${message}\n` : ''}${negate ? 'not ' : ''}${text}`);
  };
  return {
    toBe: (e) => check(Object.is(actual, e), `expected ${show(actual)} to be ${show(e)}`),
    toEqual: (e) => check(equals(actual, e), `expected ${show(actual)} to equal ${show(e)}`),
    toStrictEqual: (e) => check(equals(actual, e), `expected ${show(actual)} to equal ${show(e)}`),
    toContain: (e) => check(contains(actual, e), `expected ${show(actual)} to contain ${show(e)}`),
    toContainEqual: (e) => check([...actual].some((x) => equals(x, e)), `expected ${show(actual)} to contain an element equal to ${show(e)}`),
    toHaveLength: (n) => check(actual != null && actual.length === n, `expected length ${n}, got ${actual?.length} in ${show(actual)}`),
    toBeUndefined: () => check(actual === undefined, `expected ${show(actual)} to be undefined`),
    toBeDefined: () => check(actual !== undefined, `expected ${show(actual)} to be defined`),
    toBeNull: () => check(actual === null, `expected ${show(actual)} to be null`),
    toBeTruthy: () => check(Boolean(actual), `expected ${show(actual)} to be truthy`),
    toBeFalsy: () => check(!actual, `expected ${show(actual)} to be falsy`),
    toBeGreaterThan: (n) => check(actual > n, `expected ${show(actual)} > ${n}`),
    toBeGreaterThanOrEqual: (n) => check(actual >= n, `expected ${show(actual)} >= ${n}`),
    toBeLessThan: (n) => check(actual < n, `expected ${show(actual)} < ${n}`),
    toMatchObject: (e) => check(matchesObject(actual, e), `expected ${show(actual)} to match ${show(e)}`),
    toMatch: (re) => check(typeof re === 'string' ? String(actual).includes(re) : re.test(String(actual)), `expected ${show(actual)} to match ${show(re)}`),
    toThrow: (e) => {
      let threw = false;
      let err;
      try { actual(); } catch (x) { threw = true; err = x; }
      const ok = threw && (e === undefined || (e instanceof RegExp ? e.test(String(err?.message ?? err)) : String(err?.message ?? err).includes(e)));
      check(ok, `expected the function to throw${e === undefined ? '' : ` ${show(e)}`}${threw ? `, it threw ${show(err?.message ?? err)}` : ''}`);
    },
  };
}

export function expect(actual, message) {
  const m = makeMatchers(actual, message, false);
  m.not = makeMatchers(actual, message, true);
  return m;
}
expect.objectContaining = (sample) => asymmetric('ObjectContaining', sample, (actual) => actual !== null && typeof actual === 'object' && Object.keys(sample).every((k) => k in actual && equals(actual[k], sample[k])));
expect.arrayContaining = (sample) => asymmetric('ArrayContaining', sample, (actual) => Array.isArray(actual) && sample.every((s) => actual.some((a) => equals(a, s))));

function formatTitle(title, row, index) {
  const args = Array.isArray(row) ? row : [row];
  let i = 0;
  let out = title.replace(/%[sdijo#%]/g, (tok) => {
    if (tok === '%%') return '%';
    if (tok === '%#') return String(index);
    const v = args[i++];
    return tok === '%s' ? String(v) : tok === '%d' || tok === '%i' ? String(Number(v)) : JSON.stringify(v);
  });
  if (!Array.isArray(row) && row !== null && typeof row === 'object') out = out.replace(/\$([A-Za-z_]\w*)/g, (_, k) => String(row[k]));
  return out;
}

function withEach(fn) {
  fn.each = (table) => (title, body) => {
    table.forEach((row, index) => fn(formatTitle(title, row, index), () => (Array.isArray(row) ? body(...row) : body(row))));
  };
  return fn;
}

export const it = withEach((name, optionsOrBody, body) => (body === undefined ? nodeIt(name, optionsOrBody) : nodeIt(name, optionsOrBody, body)));
export const test = it;
export const describe = (name, body) => nodeDescribe(name, body);

/** True when the temp directory's file system ignores case (macOS and Windows defaults), where a file probed under another case exists. */
export function caseInsensitiveTmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'runes-case-'));
  try {
    writeFileSync(path.join(dir, 'a'), '');
    return existsSync(path.join(dir, 'A'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
export { beforeEach, afterEach };
