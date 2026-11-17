---
id: javascript-jest-mock-literal-edge
language: javascript
category: dynamic
expectation: edge
cites: "Jest — `jest.mock(moduleName)` replaces the module a path names"
---

## Rule

`jest.mock('../b/value')` in a JavaScript test replaces the module at a string-literal path, and the test that calls it depends on that module. The call gives the edge a dynamic `import('../b/value')` gives.

## Files

```js path=r/b/value.js
export const x = 1;
```

```js path=r/app/use.test.js
jest.mock('../b/value');
```

## Expect

- r/app/use.test.js:1 -> node:b      # `jest.mock('../b/value')` with a string literal names r/b/value.js (node b)

## Why

A JavaScript test that mocks a module without importing it still depends on that module, so its edge is recorded as a TypeScript test's is.
