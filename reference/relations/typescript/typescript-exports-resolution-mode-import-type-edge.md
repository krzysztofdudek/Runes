---
id: typescript-exports-resolution-mode-import-type-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 getModeForUsageLocation: on an import type the `resolution-mode` attribute of its options overrides the mode of the file (TypeScript 5.3 release notes, \"resolution-mode in import types and type-only imports\")"
---

## Rule

An import type whose options carry `{ with: { 'resolution-mode': 'import' } }` reads the `import` condition, and one that carries `'require'` reads `require`, whatever the format of the file that holds it, for `import('lib', …).T` and for `typeof import('lib', …)` alike.

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
export let v: import('lib', { with: { 'resolution-mode': 'import' } }).T;
export type Lib = typeof import('lib', { with: { 'resolution-mode': 'import' } });
```

```ts path=packages/app/use.mts
export let v: import('lib', { with: { 'resolution-mode': 'require' } }).T;
```

## Expect

- packages/app/use.cts:1 -> node:esm      # the attribute names `import`, in a file that requires
- packages/app/use.cts:2 -> node:esm
- packages/app/use.mts:1 -> node:cjs      # the attribute names `require`, in a file that imports

## Why

Without the attribute an import type is resolved with the mode of its file (`typescript-exports-nodenext-typeof-import-in-cts-file-edge`). The same options on a dynamic `import()` call are import attributes for the runtime and decide no condition.
