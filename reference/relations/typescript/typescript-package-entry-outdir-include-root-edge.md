---
id: typescript-package-entry-outdir-include-root-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript project references: an import that resolves to a referenced project's output file is read from the source file it is emitted from (`outDir` back to `rootDir`); `rootDir` defaults to the common directory of the project's input files (TypeScript 5) or to the tsconfig's directory (TypeScript 6)"
---

## Rule

With `outDir` set and no `rootDir`, the source root is the one the compiler computes: the longest common directory of the non-declaration files the project holds, or the directory of the tsconfig. A reading counts only when it names a file the project holds, and the readings that do must name one file. Here `include` holds `src/` only, so `dist/index.js` maps to `src/index.ts`.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/core/package.json
{ "name": "@acme/core", "main": "./dist/index.js" }
```

```json path=packages/core/tsconfig.json
{ "compilerOptions": { "outDir": "dist" }, "include": ["src"] }
```

```ts path=packages/core/src/index.ts
export const value = 1;
```

```ts path=packages/core/src/util/helper.ts
export const helper = 3;
```

```ts path=packages/core/scripts/index.ts
export {};
```

```json path=packages/app/package.json
{ "name": "@acme/app", "dependencies": { "@acme/core": "workspace:*" } }
```

```ts path=packages/app/main.ts
import { value } from '@acme/core';
console.log(value);
```

## Expect

- packages/app/main.ts:1 -> node:src      # the project holds src/index.ts and src/util/helper.ts, so its root is src: dist/index.js comes from packages/core/src/index.ts

## Why

`scripts/index.ts` lies outside `include`, so the project does not emit it and it does not move the root. The tsconfig's own directory, the root TypeScript 6 takes, would put the source of `dist/index.js` at `packages/core/index.ts`, which is not there.
