---
id: typescript-workspace-pnpm-undeclared-member-silence
language: typescript
category: import
expectation: silence
cites: "pnpm docs (Workspace, symlinked node_modules structure): a workspace package is symlinked into the node_modules of the projects that declare it as a dependency, and a project can require only what its own package.json declares"
---

## Rule

In a pnpm workspace a bare import of a workspace member binds only where a project above the importing file declares it: the importing package, or the workspace root. A package that declares no dependency on the member has no link to it, so its import binds nothing, as TypeScript resolves nothing for it after an install.

## Files

```json path=package.json
{ "name": "root", "private": true, "packageManager": "pnpm@9.11.0" }
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

```json path=packages/plugin/package.json
{ "name": "plugin", "version": "1.0.0" }
```

```ts path=packages/plugin/tests/fixture/input.ts
import { X } from 'lib';
console.log(X);
```

## Expect

- silence      # `plugin` declares no dependency on `lib`, so pnpm links nothing under that name for it

## Why

pnpm gives each project a node_modules that holds only what the project declares, and the root's holds only what the root declares. npm and yarn link every workspace at the root, where any file under it finds them, so there the same import binds (`typescript-workspace-undeclared-member-npm-edge`). This is the layout of the SWC plugin fixtures of amannn/next-intl, which import `next-intl` from a package with no dependencies.
