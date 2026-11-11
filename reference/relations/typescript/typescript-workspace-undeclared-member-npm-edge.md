---
id: typescript-workspace-undeclared-member-npm-edge
language: typescript
category: import
expectation: edge
cites: "npm docs (workspaces): \"workspaces … are automatically symlinked to the root node_modules folder\" during install"
---

## Rule

In an npm workspace every member is linked at the root's node_modules, so a file of a package that does not declare the member still finds it. The import binds.

## Files

```json path=package.json
{ "name": "root", "private": true, "packageManager": "npm@10.8.2", "workspaces": ["packages/*"] }
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

- packages/plugin/use.ts:1 -> node:lib      # npm links every workspace at the root

## Why

The declaration decides only under pnpm, whose node_modules hold what each project declares (`typescript-workspace-pnpm-undeclared-member-silence`).
