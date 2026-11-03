---
id: typescript-workspace-protocol-pnpm-edge
language: typescript
category: import
expectation: edge
cites: "pnpm docs (Workspace): with the `workspace:` protocol \"pnpm will refuse to resolve to anything other than a local workspace package\", whatever link-workspace-packages says"
---

## Rule

A dependency declared with the `workspace:` protocol is always the workspace package of that name, under pnpm 9 and later too, where a plain range is not linked: the import gives an edge to the member's entry file.

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
{ "name": "app", "dependencies": { "lib": "workspace:*" } }
```

```ts path=examples/app/use.ts
import { X } from 'lib';
console.log(X);
```

## Expect

- examples/app/use.ts:1 -> node:lib      # `workspace:*` is always the member, whatever link-workspace-packages says
