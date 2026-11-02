---
id: typescript-tsconfig-extends-subpath-directory-package-field-edge
language: typescript
category: import
expectation: edge
cites: "tsc `extends` naming a package subpath that is a directory with a package.json of its own — that package.json's `tsconfig` field is read before the directory's tsconfig.json"
---

## Rule

A tsconfig `extends` that names a package subpath (`@acme/tsconfig/base`), where the package's package.json has no `exports`, is tried as `base`, then `base.json`, then the directory `base`. When that directory holds a package.json of its own, its `tsconfig` field names the base config, as it does for a package root; only when the field is absent or names no file does the lookup fall back to `base/tsconfig.json`. Here the field names `configs/real.json`; the `tsconfig.json` beside that package.json is a leftover the field outranks, so its `paths` never apply.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/tsconfig/package.json
{ "name": "@acme/tsconfig", "version": "1.0.0" }
```

```json path=packages/tsconfig/base/package.json
{ "tsconfig": "configs/real.json" }
```

```json path=packages/tsconfig/base/configs/real.json
{ "compilerOptions": { "paths": { "@acme/*": ["../../../*/index.ts"] } } }
```

```json path=packages/tsconfig/base/tsconfig.json
{ "compilerOptions": { "paths": { "@acme/*": ["../../legacy/*.ts"] } } }
```

```json path=packages/app/tsconfig.json
{ "extends": "@acme/tsconfig/base" }
```

```ts path=packages/ui/index.ts
export const Button = 1;
```

```ts path=packages/legacy/ui.ts
export const Button = 0;
```

```ts path=packages/app/main.ts
import { Button } from '@acme/ui';
console.log(Button);
```

## Expect

- packages/app/main.ts:1 -> node:ui      # the base is base/configs/real.json, the file the subpath directory's `tsconfig` field names; its `@acme/*` alias → packages/ui/index.ts, never packages/legacy/ui.ts
