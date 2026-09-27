// The expect helper the relation suites run on must fail when it should: a helper that always passes would make 1200 tests vacuous.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expect, equals } from './helpers/expect.mjs';

const fails = (fn) => assert.throws(fn, assert.AssertionError);

test('matchers fail on a mismatch and pass on a match', () => {
  expect(1).toBe(1); fails(() => expect(1).toBe(2));
  expect({ a: 1, b: undefined }).toEqual({ a: 1 }); fails(() => expect({ a: 1 }).toEqual({ a: 2 }));
  expect([1, [2, { c: 3 }]]).toEqual([1, [2, { c: 3 }]]); fails(() => expect([1, 2]).toEqual([1, 2, 3]));
  expect(new Set(['a', 'b'])).toContain('a'); fails(() => expect(new Set(['a'])).toContain('b'));
  expect('abc').toContain('b'); fails(() => expect(['a']).toContain('b'));
  expect([{ a: 1 }]).toContainEqual({ a: 1 }); fails(() => expect([{ a: 1 }]).toContainEqual({ a: 2 }));
  expect([1, 2]).toHaveLength(2); fails(() => expect([]).toHaveLength(1));
  expect(undefined).toBeUndefined(); fails(() => expect(0).toBeUndefined());
  expect(0).toBeDefined(); fails(() => expect(undefined).toBeDefined());
  expect(null).toBeNull(); expect(0).toBeFalsy(); fails(() => expect(1).toBeFalsy());
  expect(3).toBeGreaterThan(2); fails(() => expect(2).toBeGreaterThan(2)); expect(2).toBeGreaterThanOrEqual(2);
  expect({ a: { b: 1, c: 2 }, d: 3 }).toMatchObject({ a: { b: 1 } }); fails(() => expect({ a: { b: 1 } }).toMatchObject({ a: { b: 2 } }));
  expect(1).not.toBe(2); fails(() => expect(1).not.toBe(1));
  fails(() => expect([1]).not.toContain(1));
});

test('asymmetric matchers', () => {
  expect([{ kind: 'import', line: 1, extra: true }]).toEqual([expect.objectContaining({ kind: 'import' })]);
  fails(() => expect([{ kind: 'call' }]).toEqual([expect.objectContaining({ kind: 'import' })]));
  expect(['a', 'b', 'c']).toEqual(expect.arrayContaining(['c', 'a']));
  fails(() => expect(['a']).toEqual(expect.arrayContaining(['z'])));
  expect([{ candidates: [{ kind: 'path', specifier: 'x', isPackage: false }] }]).toContainEqual(expect.objectContaining({ candidates: [expect.objectContaining({ specifier: 'x' })] }));
  assert.equal(equals(new Map([[1, { a: 1 }]]), new Map([[1, { a: 1 }]])), true);
  assert.equal(equals(new Set([1]), new Set([2])), false);
});

test('a custom message leads the failure', () => {
  assert.throws(() => expect(1, 'case x: wrong').toBe(2), /^AssertionError.*case x: wrong/s);
});
