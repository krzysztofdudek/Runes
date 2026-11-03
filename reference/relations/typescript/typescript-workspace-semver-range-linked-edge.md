---
id: typescript-workspace-semver-range-linked-edge
language: typescript
category: import
expectation: edge
cites: "pnpm `link-workspace-packages=true` (.npmrc, read by pnpm up to 10): a dependency declared by a semver range that a workspace package's version satisfies is linked to that package instead of installed from the registry (next-intl declares `\"packageManager\": \"pnpm@9.11.0\"`, sets the option in its .npmrc, and its examples declare `\"next-intl\": \"^4.0.0\"`; pnpm-lock.yaml records `version: link:../../packages/next-intl`)"
---

## Rule

A dependency written as a semver range (`^4.0.0`) of a workspace package whose version satisfies it binds to that package by name when pnpm links by range, which a repository asks for with `link-workspace-packages=true` in its .npmrc, so the import of the package's own name gives an edge to its entry file. Without the option pnpm 9 and later install the registry copy (`typescript-workspace-pnpm-range-unlinked-silence`), and a range the version does not satisfy is never linked (`typescript-workspace-range-unsatisfied-silence`). The fixture's `exports` names one target, so no export-condition question comes in.

## Files

```json path=package.json
{ "name": "root", "private": true, "packageManager": "pnpm@9.11.0" }
```

```text path=.npmrc
link-workspace-packages=true
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

- examples/app/use.ts:1 -> node:lib      # `lib` declared as `^4.0.0` and satisfied by 4.14.9, linked by pnpm because the repository sets link-workspace-packages=true
