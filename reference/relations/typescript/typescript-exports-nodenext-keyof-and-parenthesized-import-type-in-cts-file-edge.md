---
id: typescript-exports-nodenext-keyof-and-parenthesized-import-type-in-cts-file-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 getModeForUsageLocation: an import type under `keyof` or inside parentheses is resolved by the format of its file, not as a dynamic `import()` call"
---

## Rule

Under `module` nodenext, an import type written after `keyof` or inside a parenthesized type in a `.cts` file reads the `require` condition. Of an entry that lists `import` first, the `require` branch's file binds. The grammar cannot read either form and recovers from it, and the extractor still takes the specifier for an import type.

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
export type K = keyof import('lib').T;
export type P = (import('lib').T);
```

## Expect

- packages/app/use.cts:1 -> node:cjs      # after `keyof`
- packages/app/use.cts:2 -> node:cjs      # inside parentheses

## Why

Both are types, resolved by the mode of the file. The grammar reads `keyof import('lib').T` as an ERROR node and the parenthesized type as the parameters of an arrow function; the extractor reads the token that introduces the type, or the member chain standing where a parameter's name belongs, to tell.
