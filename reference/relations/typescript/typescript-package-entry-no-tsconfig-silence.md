---
id: typescript-package-entry-no-tsconfig-silence
language: typescript
category: import
expectation: silence
cites: "Node package entry points: `main` names the file a bare import of the package loads"
---

## Rule

A package entry that names a file missing from the repository, in a package with no tsconfig that maps it to a source, binds nothing: the import is not attributed to the package directory or to a file of a similar name. The resolver reports it once per package as `package-entry-missing`.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/core/package.json
{ "name": "@acme/core", "main": "./dist/index.js" }
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

- silence      # dist/index.js is not there and no tsconfig says what it is built from

## Why

A bundler or Babel may build `dist/index.js` from any file, and the repository's structure may map `packages/core/src/` and `packages/core/` to different owners, so the package directory as a whole is not a target. The diagnostic lets a consumer say that imports of this package are not resolved.
