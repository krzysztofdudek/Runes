---
id: typescript-exports-resolution-mode-type-only-import-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 getModeForUsageLocation: on a type-only import or export declaration the `resolution-mode` import attribute overrides the mode of the file (TypeScript 5.3 release notes, \"resolution-mode in import types and type-only imports\")"
---

## Rule

A type-only import that carries `with { 'resolution-mode': 'import' }` reads the `import` condition, and one that carries `'require'` reads `require`, whatever the format of the file that holds it. So in a `.cts` file the `import` branch's file binds, and in a `.mts` file the `require` branch's file.

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
import type { T } from 'lib' with { 'resolution-mode': 'import' };
export type U = T;
```

```ts path=packages/app/use.mts
import type { T } from 'lib' with { 'resolution-mode': 'require' };
export type U = T;
```

## Expect

- packages/app/use.cts:1 -> node:esm      # the attribute names `import`, in a file that requires
- packages/app/use.mts:1 -> node:cjs      # the attribute names `require`, in a file that imports

## Why

The attribute exists so that a file of one format can read the types a package gives the other format. The compiler honours it only where the whole declaration is type-only (`import type`, `export type`); on a value import it reports the attribute and resolves by the file, and so does Runes.
