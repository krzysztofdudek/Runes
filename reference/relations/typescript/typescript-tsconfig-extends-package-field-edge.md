---
id: typescript-tsconfig-extends-package-field-edge
language: typescript
category: import
expectation: edge
cites: "tsc `extends` naming a package with no `exports` — the `tsconfig` field of its package.json is read first, then its tsconfig.json"
---

## Rule

A tsconfig `extends` that names a package (`@acme/tsconfig`), where the package's package.json has no `exports`, is resolved the way tsc resolves it: the `tsconfig` field of that package.json names the base config, and only when the field is absent does the lookup fall back to the `tsconfig.json` in the package's directory. The shared base this package names lives at `configs/base.json`; the `tsconfig.json` beside its package.json is a leftover the field outranks, so its `paths` never apply.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/tsconfig/package.json
{ "name": "@acme/tsconfig", "version": "1.0.0", "tsconfig": "configs/base.json" }
```

```json path=packages/tsconfig/configs/base.json
{ "compilerOptions": { "paths": { "@acme/*": ["../../*/index.ts"] } } }
```

```json path=packages/tsconfig/tsconfig.json
{ "compilerOptions": { "paths": { "@acme/*": ["../legacy/*.ts"] } } }
```

```json path=packages/app/tsconfig.json
{ "extends": "@acme/tsconfig" }
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

- packages/app/main.ts:1 -> node:ui      # the base is configs/base.json, the file the `tsconfig` field names; its `@acme/*` alias → packages/ui/index.ts, never packages/legacy/ui.ts
