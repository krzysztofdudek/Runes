---
id: typescript-resolution-mode-clause-on-next-line-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 parseImportAttributes (the `with` clause of an import declaration may start on the line after the module specifier); getModeForUsageLocation"
---

## Rule

The `with` clause of a type-only import may start on the line after the module specifier, and the declaration is one: the attribute names `require`, so the `require` branch's file binds in a `.mts` file that would import. The declaration is read once, with its mode, and gives no second edge by the file's own format.

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

```ts path=packages/app/use.mts
import type { T } from 'lib'
  with { 'resolution-mode': 'require' };
export type U = T;
```

## Expect

- packages/app/use.mts:1 -> node:cjs      # the attribute names `require`, in a file that imports; no edge to node esm

## Why

The grammar reads a `with` on the next line as a statement of its own, so the declaration was read without its mode and, from the recovery of its text, once more with it: the file's own format gave an edge beside the right one.
