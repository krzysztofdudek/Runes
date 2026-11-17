---
id: typescript-vi-and-jest-mock-literal-edge
language: typescript
category: dynamic
expectation: edge
cites: "Vitest/Jest — `vi.mock('path')` and `jest.mock('path')` replace the module at a path the test names"
---

## Rule

`vi.mock('../b/value')` and `jest.mock('../b/value')` replace the module at a string-literal path. The test that calls them depends on that module, so each call gives the edge a dynamic `import('../b/value')` gives. A path that is not a string literal names no module and gives no edge.

## Files

```ts path=r/b/value.ts
export const x = 1;
```

```ts path=r/app/use.test.ts
vi.mock('../b/value');
jest.mock('../b/value');
```

## Expect

- r/app/use.test.ts:1 -> node:b      # `vi.mock('../b/value')` with a string literal names r/b/value.ts (node b)
- r/app/use.test.ts:2 -> node:b      # `jest.mock('../b/value')` with a string literal names the same module

## Why

A mocked module is a dependency of the test that mocks it: a change to that module changes what the test checks, so the registration must record the edge that the module's import records.
