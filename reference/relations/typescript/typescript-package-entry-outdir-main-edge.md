---
id: typescript-package-entry-outdir-main-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript project references: an import that resolves to a referenced project's output file is read from the source file it is emitted from (`outDir` back to `rootDir`)"
---

## Rule

A package whose `main`, `types` and `exports` name files under its `outDir` that are not in the repository is read through its own tsconfig: the target under `outDir` maps to the source under `rootDir` it is compiled from, here `dist/index.d.ts` to `src/index.ts`.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/core/package.json
{
  "name": "@acme/core",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

```json path=packages/core/tsconfig.json
{ "compilerOptions": { "rootDir": "src", "outDir": "dist", "declaration": true } }
```

```ts path=packages/core/src/index.ts
export const value = 1;
```

```json path=packages/app/package.json
{ "name": "@acme/app", "dependencies": { "@acme/core": "workspace:*" } }
```

```ts path=packages/app/main.ts
import { value } from '@acme/core';
console.log(value);
```

## Expect

- packages/app/main.ts:1 -> node:src      # `dist/index.d.ts` is not there; `outDir` dist maps back to `rootDir` src: packages/core/src/index.ts

## Why

The build output is ignored by git, so a clean checkout and the commit itself hold no `dist/`. The package's own tsconfig says where each output file comes from: `<outDir>/a/b.js` and `<outDir>/a/b.d.ts` are emitted from `<rootDir>/a/b.ts`. The compiler makes the same step for a referenced project, whose output need not be built. The answer is the same before and after a build when the consumer passes the ignored output as excluded.
