---
id: typescript-marker-package-json-local-dependency-edge
language: typescript
category: import
expectation: edge
cites: "Node.js module resolution walks node_modules upwards; a package.json holding only `type` installs nothing"
---

## Rule

A package.json that names no package and declares no dependencies or workspace (a `{"type": "module"}` marker for one directory) installs nothing, so the files under it see the dependencies of the package around it, a `file:` dependency included.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "@acme/vend": "file:../../vendor/vend" } }
```

```json path=packages/app/esm/package.json
{ "type": "module" }
```

```json path=vendor/vend/package.json
{ "name": "@acme/vend", "main": "./index.ts" }
```

```ts path=vendor/vend/index.ts
export const vend = 1;
```

```ts path=packages/app/esm/main.ts
import { vend } from '@acme/vend';
console.log(vend);
```

## Expect

- packages/app/esm/main.ts:1 -> node:vend      # the marker is passed over; packages/app declares @acme/vend as file:../../vendor/vend
