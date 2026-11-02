---
id: typescript-tsconfig-extends-subpath-directory-edge
language: typescript
category: import
expectation: edge
cites: "tsc `extends` naming a package subpath with no `exports` — tried as the path, the path with `.json`, then the path's tsconfig.json"
---

## Rule

A tsconfig `extends` that names a package subpath (`@acme/tsconfig/base`), where the package's package.json has no `exports`, is tried as `base`, then `base.json`, then `base/tsconfig.json`. Here only the directory form exists, so `base/tsconfig.json` is the base config and its `paths` apply.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/tsconfig/package.json
{ "name": "@acme/tsconfig", "version": "1.0.0" }
```

```json path=packages/tsconfig/base/tsconfig.json
{ "compilerOptions": { "paths": { "@acme/*": ["../../*/index.ts"] } } }
```

```json path=packages/app/tsconfig.json
{ "extends": "@acme/tsconfig/base" }
```

```ts path=packages/ui/index.ts
export const Button = 1;
```

```ts path=packages/app/main.ts
import { Button } from '@acme/ui';
console.log(Button);
```

## Expect

- packages/app/main.ts:1 -> node:ui      # the base is base/tsconfig.json; its `@acme/*` alias → packages/ui/index.ts
