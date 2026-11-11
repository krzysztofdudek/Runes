---
id: typescript-workspace-pnpm-hoisted-undeclared-member-edge
language: typescript
category: import
expectation: edge
cites: "pnpm docs (Settings): shamefullyHoist \"creates a flat node_modules structure\"; hoistWorkspacePackages (default true): \"packages from the workspaces are symlinked to either <workspace_root>/node_modules/.pnpm/node_modules or to <workspace_root>/node_modules depending on other hoisting settings\""
---

## Rule

A pnpm workspace that hoists publicly (`shamefully-hoist=true`, `node-linker=hoisted` or a `public-hoist-pattern` in .npmrc, or the same settings in pnpm-workspace.yaml) may link a member into the root's node_modules whether or not anyone above the importing file declares it. Runes cannot tell which members those are, so an undeclared import of a member stays bound there.

## Files

```json path=package.json
{ "name": "root", "private": true, "packageManager": "pnpm@9.11.0" }
```

```ini path=.npmrc
shamefully-hoist=true
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

```json path=packages/app/package.json
{ "name": "app", "version": "1.0.0", "dependencies": { "lib": "workspace:*" } }
```

```json path=packages/plugin/package.json
{ "name": "plugin", "version": "1.0.0" }
```

```ts path=packages/plugin/use.ts
import { X } from 'lib';
console.log(X);
```

## Expect

- packages/plugin/use.ts:1 -> node:lib      # hoisted to the root's node_modules, where `plugin` finds it

## Why

With public hoisting the dependencies of every project, workspace members among them, are linked at the root as npm links them. Without it the same import binds nothing (`typescript-workspace-pnpm-undeclared-member-silence`).
