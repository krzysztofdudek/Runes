---
id: typescript-package-entry-outdir-trailing-slash-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript compiler options `rootDir`, `outDir` and `declarationDir` (paths; a trailing slash names the same directory); TypeScript project references: an output file is read from the source it is emitted from"
---

## Rule

A tsconfig that writes `rootDir`, `outDir` or `declarationDir` with a trailing slash names the same directories as one written without it. A package entry under that `outDir` or `declarationDir` maps back to its source under that `rootDir`, and the source's path holds no doubled slash.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "exports": {
    ".": { "types": "./dist/types/index.d.ts", "default": "./dist/js/index.js" },
    "./util": { "types": "./dist/types/util.d.ts", "default": "./dist/js/util.js" }
  }
}
```

```json path=packages/lib/tsconfig.json
{ "compilerOptions": { "rootDir": "./src/", "outDir": "./dist/js/", "declarationDir": "./dist/types/", "declaration": true } }
```

```ts path=packages/lib/src/index.ts
export const value = 1;
```

```ts path=packages/lib/src/util.ts
export const util = 2;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "compilerOptions": { "module": "nodenext" } }
```

```ts path=packages/app/main.ts
import { value } from 'lib';
import { util } from 'lib/util';
console.log(value, util);
```

## Expect

- packages/app/main.ts:1 -> node:src      # the `types` branch, dist/types/index.d.ts, is emitted from src/index.ts
- packages/app/main.ts:2 -> node:src      # dist/types/util.d.ts, from src/util.ts

## Why

`path.posix.normalize` keeps the trailing slash of `./dist/types/`, so the output prefix was looked for as `dist/types//` and an entry under it mapped to nothing, and a `rootDir` of `./src/` gave the source `src//index.ts`. hono's `tsconfig.build.json` writes its directories this way.
