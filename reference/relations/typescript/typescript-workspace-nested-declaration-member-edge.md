---
id: typescript-workspace-nested-declaration-member-edge
language: typescript
category: import
expectation: edge
cites: "npm `workspaces` (installed from the enclosing root; a member's own `workspaces` is ignored), pnpm, and yarn nested worktrees — the enclosing members are linked where a member's files find them"
---

## Rule

A workspace member that declares a workspace of its own (an e2e demo with its own `workspaces`) is still installed from the enclosing root, so its files see the enclosing workspace's members as well as its own.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*", "e2e/demo"] }
```

```json path=packages/ui/package.json
{ "name": "@acme/ui", "main": "./index.ts" }
```

```ts path=packages/ui/index.ts
export const Button = 1;
```

```json path=e2e/demo/package.json
{ "name": "demo", "private": true, "workspaces": ["libs/*"] }
```

```ts path=e2e/demo/app/main.ts
import { Button } from '@acme/ui';
console.log(Button);
```

## Expect

- e2e/demo/app/main.ts:1 -> node:ui      # e2e/demo is a member of the root workspace, so the root's member @acme/ui is linked for it
