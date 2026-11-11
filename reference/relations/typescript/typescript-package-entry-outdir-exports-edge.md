---
id: typescript-package-entry-outdir-exports-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript project references: an import that resolves to a referenced project's output file is read from the source file it is emitted from (`outDir` back to `rootDir`)"
---

## Rule

An `exports` entry whose branches all name build output (`./build/index.d.ts`, `./build/index.js`) maps back to the source through the package's tsconfig, with `rootDir` and `outDir` read through its `extends` chain and resolved from the config that sets them. A subpath pattern maps the same way.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=tsconfig.json
{ "compilerOptions": { "module": "nodenext", "declaration": true } }
```

```json path=packages/core/package.json
{
  "name": "@acme/core",
  "main": "./build/index.js",
  "types": "./build/index.d.ts",
  "exports": {
    ".": {
      "types": "./build/index.d.ts",
      "require": "./build/index.js",
      "import": "./build/index.mjs",
      "default": "./build/index.js"
    },
    "./lib/*": {
      "types": "./build/lib/*.d.ts",
      "default": "./build/lib/*.js"
    },
    "./package.json": "./package.json"
  }
}
```

```json path=packages/core/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "rootDir": "src", "outDir": "build" },
  "include": ["./src/**/*"],
  "exclude": ["./**/__tests__/**/*"]
}
```

```ts path=packages/core/src/index.ts
export const value = 1;
```

```ts path=packages/core/src/lib/deep.ts
export const deep = 2;
```

```json path=packages/app/package.json
{ "name": "@acme/app", "dependencies": { "@acme/core": "workspace:*" } }
```

```json path=packages/app/tsconfig.json
{ "extends": "../../tsconfig.json" }
```

```ts path=packages/app/main.ts
import { value } from '@acme/core';
import { deep } from '@acme/core/lib/deep';
console.log(value, deep);
```

## Expect

- packages/app/main.ts:1 -> node:src      # the `types` branch names build/index.d.ts, emitted from packages/core/src/index.ts
- packages/app/main.ts:2 -> node:lib      # build/lib/deep.d.ts, emitted from packages/core/src/lib/deep.ts

## Why

The build output is ignored by git, so a clean checkout and the commit itself hold no `build/`. The package's own tsconfig says where each output file comes from: `<outDir>/a/b.js` and `<outDir>/a/b.d.ts` are emitted from `<rootDir>/a/b.ts`. The compiler makes the same step for a referenced project, whose output need not be built. The answer is the same before and after a build when the consumer passes the ignored output as excluded. This is the layout of jestjs/jest, where every package's `exports` name `./build/` and `/packages/*/build/` is ignored.
