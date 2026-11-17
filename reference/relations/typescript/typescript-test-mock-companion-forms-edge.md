---
id: typescript-test-mock-companion-forms-edge
language: typescript
category: dynamic
expectation: edge
cites: "Jest — `jest.requireActual`, `jest.requireMock`, `jest.doMock`, `jest.unmock` take a module path, and `jest.mock` returns the `jest` object for chaining; Vitest — `vi.importActual`, `vi.doMock` take a module path"
---

## Rule

The companion forms of a test mock name a module by its path as `vi.mock` and `jest.mock` do: `jest.requireActual` and `vi.importActual` load the real module, `jest.requireMock` loads its mock, `jest.doMock` and `vi.doMock` replace it without hoisting, and `jest.unmock` takes it back from the automatic mock. Each with a string-literal path gives the edge a dynamic `import()` of that path gives. `jest.mock` returns the `jest` object, so in `jest.mock('a').mock('b')` the second call names a module too. `jest.requireActual` returns the module, not the `jest` object, so a `.mock` called on what it returns is no mock call, and a path that is not a string literal names no module.

## Files

```ts path=r/a/real.ts
export const real = 1;
```

```ts path=r/b/fake.ts
export const fake = 1;
```

```ts path=r/c/second.ts
export const second = 1;
```

```ts path=r/d/other.ts
export const other = 1;
```

```ts path=r/app/use.test.ts
const real = jest.requireActual('../a/real');
const actual = await vi.importActual('../a/real');
const fake = jest.requireMock('../b/fake');
jest.doMock('../b/fake', () => ({}));
vi.doMock('../b/fake');
jest.unmock('../b/fake');
jest.mock('../b/fake').mock('../c/second');
jest.requireActual(process.env.TARGET);
jest.requireActual('../a/real').mock('../d/other');
```

## Expect

- r/app/use.test.ts:1 -> node:a      # jest.requireActual loads the real module
- r/app/use.test.ts:2 -> node:a      # vi.importActual loads the real module
- r/app/use.test.ts:3 -> node:b      # jest.requireMock
- r/app/use.test.ts:4 -> node:b      # jest.doMock
- r/app/use.test.ts:5 -> node:b      # vi.doMock
- r/app/use.test.ts:6 -> node:b      # jest.unmock
- r/app/use.test.ts:7 -> node:b      # the first path of the chain
- r/app/use.test.ts:7 -> node:c      # and the second
- r/app/use.test.ts:9 -> node:a      # what jest.requireActual returns is no jest object, so its .mock names nothing

## Why

A test that reaches a module only through one of these forms depends on it as much as one that calls `vi.mock`; which of the mock functions a test happened to use should not decide whether a consumer sees the dependency.
