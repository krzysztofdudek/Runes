---
id: typescript-exports-bundler-dynamic-import-in-cts-file-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 shouldTransformImportCallWorker: outside the Node module settings and `preserve`, a dynamic `import()` in a file whose emit format is CommonJS (a `.cts` file) is emitted as a `require`, and is resolved in CommonJS mode"
---

## Rule

Under `moduleResolution` Bundler with an ES `module`, a dynamic `import()` in a `.cts` file selects the `require` condition, because the compiler rewrites the call into a `require` there. Of an entry that lists `import` first, the `require` branch's file binds.

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
{ "compilerOptions": { "module": "esnext", "moduleResolution": "bundler" } }
```

```ts path=packages/app/use.cts
export const load = () => import('lib');
```

## Expect

- packages/app/use.cts:1 -> node:cjs      # the compiler emits `require('lib')` for this call, so `require` is entered

## Why

`getEmitSyntaxForUsageLocationWorker` asks `shouldTransformImportCall`: the module kind is neither Node16 to NodeNext nor Preserve, and the file's emit format, CommonJS for a `.cts` file, is below ES2015, so the call is resolved in CommonJS mode and `getConditions` gives `require`, `types` (Bundler adds no `node`). The same call in a `.ts` file under `module` esnext stays an `import`.
