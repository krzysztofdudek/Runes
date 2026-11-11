---
id: typescript-exports-commonjs-module-dynamic-import-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 shouldTransformImportCallWorker: under `module` commonjs, amd, umd, system or none a dynamic `import()` is emitted as a `require` and resolved in CommonJS mode"
---

## Rule

Under `moduleResolution` Bundler with `module` commonjs, a dynamic `import()` in a `.ts` file selects the `require` condition. Of an entry that lists `import` first, the `require` branch's file binds.

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
{ "compilerOptions": { "module": "commonjs", "moduleResolution": "bundler" } }
```

```ts path=packages/app/use.ts
export const load = () => import('lib');
```

## Expect

- packages/app/use.ts:1 -> node:cjs      # the compiler emits `require('lib')` for this call

## Why

The module kind is not a Node one or Preserve and the file's emit format is CommonJS (the `module` setting, as no extension or package type says otherwise), so the call is resolved in CommonJS mode: `require` and `types` are entered, `import` is passed over.
