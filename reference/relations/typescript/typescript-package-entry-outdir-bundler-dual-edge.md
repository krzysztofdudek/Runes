---
id: typescript-package-entry-outdir-bundler-dual-edge
language: typescript
category: import
expectation: edge
cites: "tsup docs (Bundle formats, Output extension): with formats `cjs` and `esm` a `.ts` entry is written as `index.js` and `index.mjs`, with `index.d.ts` and `index.d.mts` beside them; unbuild writes `.mjs`, `.cjs`, `.d.mts` and `.d.cts` the same way. TypeScript 6.0.3 after such a build binds `dist/index.d.mts` for an ES importer"
---

## Rule

A dual package built by a bundler names `./dist/index.mjs` and `./dist/index.d.mts` for its `import` branch, and both come from `src/index.ts`: a bundler writes the ES build of a `.ts` source under the `.mjs` extension, which the compiler writes only for a `.mts` source. Where the package's tsconfig maps the entry under `outDir` and no `.mts` source of that name is there, the `.ts` or `.tsx` source is the one it is built from. An ES importer binds it, and so does a CommonJS importer through `.cjs` and `.d.cts`.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/core/package.json
{
  "name": "@acme/core",
  "version": "1.0.0",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.cts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  }
}
```

```json path=packages/core/tsconfig.json
{ "compilerOptions": { "module": "esnext", "moduleResolution": "bundler", "rootDir": "src", "outDir": "dist", "declaration": true } }
```

```ts path=packages/core/src/index.ts
export const value = 1;
```

```json path=packages/app/package.json
{ "name": "@acme/app", "type": "module", "dependencies": { "@acme/core": "workspace:*" } }
```

```json path=packages/app/tsconfig.json
{ "compilerOptions": { "module": "nodenext" } }
```

```ts path=packages/app/main.ts
import { value } from '@acme/core';
console.log(value);
```

```ts path=packages/app/legacy.cts
import { value } from '@acme/core';
console.log(value);
```

## Expect

- packages/app/main.ts:1 -> node:src        # the `import` branch names dist/index.d.mts, built from packages/core/src/index.ts
- packages/app/legacy.cts:1 -> node:src     # the `require` branch names dist/index.d.cts, built from the same source

## Why

The compiler's own rule (`.mjs` and `.d.mts` from `.mts`, `.cjs` and `.d.cts` from `.cts`) is read first, so a package that holds both `src/index.mts` and `src/index.ts` keeps the compiler's answer. Only when that source is absent is the bundler's naming read. Before this, such an entry mapped to nothing: the importer got no edge and the package was reported as naming a missing entry, though its source was there.
