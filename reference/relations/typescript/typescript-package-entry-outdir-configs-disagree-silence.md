---
id: typescript-package-entry-outdir-configs-disagree-silence
language: typescript
category: import
expectation: silence
cites: "TypeScript project references: an import that resolves to a referenced project's output file is read from the source file it is emitted from (`outDir` back to `rootDir`)"
---

## Rule

Every `tsconfig.json` and `tsconfig.*.json` in the package directory whose `outDir` holds the target is asked for the source. When two of them name different files, nothing binds.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/core/package.json
{ "name": "@acme/core", "main": "./dist/index.js" }
```

```json path=packages/core/tsconfig.json
{ "compilerOptions": { "rootDir": "src", "outDir": "dist" } }
```

```json path=packages/core/tsconfig.legacy.json
{ "compilerOptions": { "rootDir": "legacy", "outDir": "dist" } }
```

```ts path=packages/core/src/index.ts
export const value = 1;
```

```ts path=packages/core/legacy/index.ts
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

- silence      # tsconfig.json says src/index.ts, tsconfig.legacy.json says legacy/index.ts

## Why

Which build wrote `dist/index.js` is not something the repository says, so either file could be the one the import means. Naming one would be a guess.
