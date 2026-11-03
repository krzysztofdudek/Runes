---
id: typescript-workspace-semver-range-linked-edge
language: typescript
category: import
expectation: edge
cites: "pnpm `link-workspace-packages=true` (.npmrc): a dependency declared by a semver range that a workspace package's version satisfies is linked to that package instead of installed from the registry (next-intl's examples declare `\"next-intl\": \"^4.0.0\"` and pnpm-lock.yaml records `version: link:../../packages/next-intl`)"
---

## Rule

A dependency written as a semver range (`^4.0.0`) of a workspace package whose version satisfies it binds to that package by name when pnpm links by range, which a repository asks for with `link-workspace-packages=true` in its .npmrc (the case format carries no such file and Runes does not read it), so the import of the package's own name gives an edge to its entry file. Runes binds a member by its name whatever range the dependency states, which is right whenever pnpm links; a range the member's version does not satisfy, or a pnpm that does not link by range, installs a registry copy and binds nothing, and Runes does not tell these apart yet.

## Files

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

- examples/app/use.ts:1 -> node:lib      # `lib` declared as `^4.0.0` and satisfied by 4.14.9, linked by pnpm when the repository sets link-workspace-packages=true
