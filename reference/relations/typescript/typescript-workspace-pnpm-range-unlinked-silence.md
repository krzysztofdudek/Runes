---
id: typescript-workspace-pnpm-range-unlinked-silence
language: typescript
category: import
expectation: silence
cites: "pnpm 9.0.0 changelog: \"link-workspace-packages: disabled by default. This means that by default, dependencies will be linked from workspace packages only when they are specified using the workspace protocol\"; pnpm docs (Workspace): without the protocol a dependency \"will be installed from the registry\""
---

## Rule

In a pnpm workspace whose pnpm is 9 or later (the root's `packageManager`, or a `lockfileVersion` of 9 or later in pnpm-lock.yaml) and which does not turn `link-workspace-packages` on, a dependency declared by a range is installed from the registry even when a workspace package of that name satisfies it. The import binds nothing in the repository.

## Files

```json path=package.json
{ "name": "root", "private": true, "packageManager": "pnpm@9.11.0" }
```

```yaml path=pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'examples/*'
```

```json path=packages/lib/package.json
{ "name": "lib", "version": "4.14.9", "exports": { ".": "./index.ts" } }
```

```ts path=packages/lib/index.ts
export const X = 1;
```

```json path=examples/app/package.json
{ "name": "app", "dependencies": { "lib": "^4.0.0" } }
```

```ts path=examples/app/use.ts
import { X } from 'lib';
console.log(X);
```

## Expect

- silence      # pnpm 9 links a range only with link-workspace-packages on; `lib` comes from the registry

## Why

pnpm 9 turned `link-workspace-packages` off by default, and pnpm's resolver tries the workspace packages for a non-`workspace:` spec only when it is on. The same repository with `link-workspace-packages=true` in its .npmrc gives the edge (`typescript-workspace-semver-range-linked-edge`); a `workspace:` spec always does (`typescript-workspace-protocol-pnpm-edge`).
