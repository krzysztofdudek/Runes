---
id: typescript-exports-preserve-dynamic-import-in-cts-file-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 shouldTransformImportCallWorker: under `module` preserve a dynamic `import()` is never rewritten, so it is resolved in ES module mode whatever the format of the file"
---

## Rule

Under `module` preserve (which implies `moduleResolution` Bundler), a dynamic `import()` in a `.cts` file keeps the `import` condition, where an import statement in the same file reads `require`.

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
{ "compilerOptions": { "module": "preserve" } }
```

```ts path=packages/app/use.cts
export const load = () => import('lib');
```

## Expect

- packages/app/use.cts:1 -> node:esm      # Preserve keeps the call as written, so `import` is entered

## Why

`shouldTransformImportCall` returns false for Preserve before it looks at the file, so the call is resolved in ES module mode and `getConditions` gives `import` and `types`.
