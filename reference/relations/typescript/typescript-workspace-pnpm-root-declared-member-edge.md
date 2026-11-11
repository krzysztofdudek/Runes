---
id: typescript-workspace-pnpm-root-declared-member-edge
language: typescript
category: import
expectation: edge
cites: "pnpm docs (Workspace, symlinked node_modules structure): a workspace package is symlinked into the node_modules of the projects that declare it as a dependency, and a project can require only what its own package.json declares"
---

## Rule

In a pnpm workspace a member the workspace root declares is linked into the root's node_modules, where every file under the root finds it. A package that does not declare the member itself still binds it.

## Files

```json path=package.json
{ "name": "root", "private": true, "packageManager": "pnpm@9.11.0", "devDependencies": { "lib": "workspace:*" } }
```

```yaml path=pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```json path=packages/lib/package.json
{ "name": "lib", "version": "1.0.0", "main": "./index.ts" }
```

```ts path=packages/lib/index.ts
export const X = 1;
```

```json path=packages/plugin/package.json
{ "name": "plugin", "version": "1.0.0" }
```

```ts path=packages/plugin/use.ts
import { X } from 'lib';
console.log(X);
```

## Expect

- packages/plugin/use.ts:1 -> node:lib      # the root declares `lib`, and the lookup walks up to the root's node_modules

## Why

Node and TypeScript look for a package in the node_modules of every directory above the importing file. The root is a project of the workspace like any member, so what it declares is linked there.
