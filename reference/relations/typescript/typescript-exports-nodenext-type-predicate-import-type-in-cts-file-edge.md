---
id: typescript-exports-nodenext-type-predicate-import-type-in-cts-file-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 getModeForUsageLocation: an import type in the type of a type predicate (`x is import('x').T`, `asserts x is import('x').T`) is resolved by the format of its file, not as a dynamic `import()` call"
---

## Rule

Under `module` nodenext, an import type written as the type of a type predicate in a `.cts` file reads the `require` condition, where a dynamic `import()` call in the same file reads `import`. Of an entry that lists `import` first, the `require` branch's file binds for `x is import('lib').T` and for `asserts x is import('lib').T` alike.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "import": "./esm/index.mts",
      "require": "./cjs/index.cts"
    }
  }
}
```

```ts path=packages/lib/esm/index.mts
export const value = 1;
export type T = number;
export interface B { b: number }
```

```ts path=packages/lib/cjs/index.cts
export const value = 2;
export type T = number;
export interface B { b: number }
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "compilerOptions": { "module": "nodenext" } }
```

```ts path=packages/app/use.cts
export function isLib(x: unknown): x is import('lib').T {
  return typeof x === 'number';
}
export function assertLib(x: unknown): asserts x is import('lib').T {}
```

## Expect

- packages/app/use.cts:1 -> node:cjs      # a type predicate's type is a type, read by the file's format
- packages/app/use.cts:4 -> node:cjs

## Why

The compiler resolves an import type by the mode of the file that holds it (`impliedNodeFormat`), whatever type position it stands in. The tree-sitter grammar reads a type predicate's type as a type node of its own, which the extractor did not list among the places an import type stands.
