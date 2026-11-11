---
id: typescript-exports-nodenext-call-type-argument-import-type-in-cts-file-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 getModeForUsageLocation: an import type written as a type argument of a call (`g<import('x').T>()`) is resolved by the format of its file, not as a dynamic `import()` call"
---

## Rule

Under `module` nodenext, an import type written as the type argument of a call in a `.cts` file reads the `require` condition. Of an entry that lists `import` first, the `require` branch's file binds. The grammar reads such a type argument as a comparison of expressions, and the extractor still takes it for an import type.

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
declare function g<T>(): void;
g<import('lib').T>();
```

## Expect

- packages/app/use.cts:2 -> node:cjs      # a type argument of a call

## Why

A type argument is a type: the compiler resolves its import type by the mode of the file (`require`, `types` and `node`). The grammar parses a call's `<import('lib').T>` as a comparison followed by an ERROR node, so the call node of the specifier lies in no type node; the extractor reads the shape of the comparison to tell.
