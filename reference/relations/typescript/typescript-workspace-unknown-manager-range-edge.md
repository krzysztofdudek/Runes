---
id: typescript-workspace-unknown-manager-range-edge
language: typescript
category: import
expectation: edge
cites: "npm, pnpm and yarn decide differently whether a range links a workspace package (arborist's satisfies check; pnpm's link-workspace-packages; yarn's enableTransparentWorkspaces), and a repository that names no package manager and holds no lockfile does not say which one installs it"
---

## Rule

When the workspace root names no package manager (`packageManager`) and holds no lockfile of one kind (pnpm-lock.yaml, package-lock.json or npm-shrinkwrap.json, yarn.lock), the manager is unknown and a declared workspace member binds by its name whatever range the dependency states, as Runes bound it before it read the manager. This can be a false edge where the manager in use would install a registry copy.

## Files

```yaml path=pnpm-workspace.yaml
packages:
  - 'packages/*'
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

- packages/app/use.ts:1 -> node:lib      # the manager is unknown, so the member binds by name as before

## Why

Even a pnpm-workspace.yaml does not say which pnpm installs the repository, and pnpm 8 and 9 differ in whether a range links by default. With `"packageManager": "pnpm@9.11.0"` or a pnpm-lock.yaml the same files give no edge (`typescript-workspace-range-unsatisfied-silence` shows the npm form).
