---
id: typescript-exports-nodenext-typeof-import-in-cts-file-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 getModeForUsageLocation: an import type, `typeof import('x')` or `import('x').T`, is resolved by the format of the file that holds it, as an import statement is, not as a dynamic `import()` call"
---

## Rule

Under `module` nodenext, an import type in a `.cts` file reads the `require` condition, where a dynamic `import()` call in the same file reads `import`. Of an entry that lists `import` first, the `require` branch's file binds, for `typeof import('lib')` and for `import('lib').T` alike.

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
```

```ts path=packages/lib/cjs/index.cts
export const value = 2;
export type T = number;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "compilerOptions": { "module": "nodenext" } }
```

```ts path=packages/app/use.cts
export type Lib = typeof import('lib');
export let v: import('lib').T;
```

## Expect

- packages/app/use.cts:1 -> node:cjs      # an import type reads the file's format
- packages/app/use.cts:2 -> node:cjs

## Why

An import type is not a call the compiler can emit: it is resolved with the mode of the file (`impliedNodeFormat`), so a `.cts` file gets `require`, `types` and `node`.
