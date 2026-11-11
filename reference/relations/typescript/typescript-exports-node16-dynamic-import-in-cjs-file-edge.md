---
id: typescript-exports-node16-dynamic-import-in-cjs-file-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 getModeForUsageLocation: under module Node16 a dynamic `import()` is resolved in ES module mode even from a CommonJS file, so it matches the `import` condition"
---

## Rule

Under `module` Node16, a dynamic `import()` in a CommonJS file (`.cts`) selects the `import` condition, where an import statement in the same file would select `require`. Of an entry that lists `require` first, the `import` branch's file binds.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "require": "./cjs/index.cts",
      "import": "./esm/index.mts"
    }
  }
}
```

```ts path=packages/lib/cjs/index.cts
export const value = 1;
```

```ts path=packages/lib/esm/index.mts
export const value = 2;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "compilerOptions": { "module": "node16" } }
```

```ts path=packages/app/use.cts
export async function load() {
  return await import('lib');
}
```

## Expect

- packages/app/use.cts:2 -> node:esm      # `import()` enters `import` whatever the file's format

## Why

A `.cts` file is CommonJS, yet TypeScript resolves a dynamic `import()` in ES module mode, so `getConditions` gives `import`, `types` and `node` and the `require` key is passed over.
