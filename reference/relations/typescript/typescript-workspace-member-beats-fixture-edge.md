---
id: typescript-workspace-member-beats-fixture-edge
language: typescript
category: import
expectation: edge
cites: "npm/yarn `workspaces` — the member matched by the globs is the package linked under its name"
---

## Rule

Inside a declared workspace, only members count when a bare specifier is matched to an in-repo package by name, and two packages sharing a name make it ambiguous only when both are members. A fixture outside the workspace globs that copies a member's name does not silence the import of the real member.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/resolver/package.json
{ "name": "@acme/resolver", "main": "./index.ts" }
```

```ts path=packages/resolver/index.ts
export const resolve = 1;
```

```json path=fixtures/fake-resolver/package.json
{ "name": "@acme/resolver", "main": "./index.ts" }
```

```ts path=fixtures/fake-resolver/index.ts
export const resolve = 2;
```

```ts path=packages/app/main.ts
import { resolve } from '@acme/resolver';
console.log(resolve);
```

## Expect

- packages/app/main.ts:1 -> node:resolver      # the member packages/resolver, not the fixture outside the globs
