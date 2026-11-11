---
id: typescript-exports-nodenext-heritage-import-call-in-cts-file-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 getModeForUsageLocation: the heritage clause of an interface (`extends`) and the `implements` clause of a class hold expressions, so an `import('x')` there is resolved as a dynamic import call"
---

## Rule

Under `module` nodenext, an `import('lib')` in the `extends` clause of an interface in a `.cts` file reads the `import` condition, as a dynamic `import()` call does, though it stands where a type is expected. Of an entry with an `import` and a `require` branch, the `import` branch's file binds, where an import type in the same file binds the `require` branch's.

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
interface I extends import('lib').B {}
export {};
```

## Expect

- packages/app/use.cts:1 -> node:esm      # an expression in a heritage clause, resolved as a dynamic import()

## Why

A heritage clause holds `ExpressionWithTypeArguments`, expressions, not type nodes: the compiler gives `import('lib')` there the mode of an import call (`import`, `types` and `node`), while it gives the same text in a type argument the mode of the file. The extractor therefore keeps the call form on it.
