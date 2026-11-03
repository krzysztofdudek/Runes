---
id: typescript-exports-node16-require-branch-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 getConditions and getImpliedNodeFormatForFile: under module Node16 a `.ts` file whose nearest package.json sets no `\"type\": \"module\"` is CommonJS, resolved with the `require`, `types` and `node` conditions"
---

## Rule

Under `module` Node16 (which implies `moduleResolution` Node16), a `.ts` file in a package without `"type": "module"` is CommonJS, and its import statements resolve with the `require` condition. Of an `exports` entry that lists `import` before `require`, both naming a file, the require branch's file is the one the import binds.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "import": "./esm/index.ts",
      "require": "./cjs/index.cts"
    }
  }
}
```

```ts path=packages/lib/esm/index.ts
export const value = 1;
```

```ts path=packages/lib/cjs/index.cts
export const value = 1;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "compilerOptions": { "module": "node16" } }
```

```ts path=packages/app/use.ts
import { value } from 'lib';
console.log(value);
```

## Expect

- packages/app/use.ts:1 -> node:cjs      # the `require` branch: a CommonJS file under Node16; `import` (node:esm) does not match

## Why

With `module` Node16 and no `moduleResolution`, TypeScript 5 and 6 both compute `moduleResolution` Node16. The package.json sets no `type`, so `getImpliedNodeFormatForFile` makes `use.ts` CommonJS, its import statement is emitted as a `require`, and `getConditions` gives `["require", "types", "node"]`: `import` is passed over and `require` names `cjs/index.cts`.
