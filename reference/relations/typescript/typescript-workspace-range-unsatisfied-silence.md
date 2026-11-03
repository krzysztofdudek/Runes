---
id: typescript-workspace-range-unsatisfied-silence
language: typescript
category: import
expectation: silence
cites: "npm's arborist (buildIdealTree): \"if the spec matches a workspace name, then see if the workspace node will satisfy the edge. if it does, we return the workspace node … spec isn't a directory, and either isn't a workspace or the workspace we have doesn't satisfy the edge. try to fetch a manifest\"; dep-valid: a range is valid when `semver.satisfies(child.version, requested.fetchSpec, true)`"
---

## Rule

A dependency whose range the workspace package's version does not satisfy is installed from the registry, under npm (here read from package-lock.json), yarn and pnpm alike, so the import binds nothing in the repository though a workspace package of that name exists.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=package-lock.json
{ "name": "root", "lockfileVersion": 3, "requires": true, "packages": {} }
```

```json path=packages/lib/package.json
{ "name": "lib", "version": "2.0.0", "exports": { ".": "./index.ts" } }
```

```ts path=packages/lib/index.ts
export const X = 1;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "^1.0.0" } }
```

```ts path=packages/app/use.ts
import { X } from 'lib';
console.log(X);
```

## Expect

- silence      # 2.0.0 does not satisfy ^1.0.0, so npm installs lib 1.x from the registry under packages/app/node_modules

## Why

npm links every workspace into the root node_modules, but an edge from `app` to `lib@^1.0.0` is not satisfied by the link to `lib@2.0.0`, so arborist fetches a registry manifest and places that copy under `packages/app/node_modules`, which Node and TypeScript find first. Changing the range to `^2.0.0` (or `*`) gives the edge.
