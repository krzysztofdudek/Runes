---
id: typescript-tsconfig-extends-exports-edge
language: typescript
category: import
expectation: edge
cites: "TS 5.0+ tsconfig `extends` naming a package — resolved through the package's `exports` (config lookup: NodeNext, CommonJS conditions), which outrank the file layout"
---

## Rule

A tsconfig `extends` that names a package subpath (`@acme/tsconfig/base`) is resolved the way tsc 5.0+ resolves it: when the package's package.json has `exports`, the subpath is looked up there (conditions `require`, `types`, `node` and `default`), and the file layout is never consulted. The shared base this package exports lives at `configs/tsconfig.base.json`; the `base.json` beside its package.json is a leftover the exports do not name, so its `paths` never apply.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/tsconfig/package.json
{ "name": "@acme/tsconfig", "version": "1.0.0", "exports": { "./base": { "require": "./configs/tsconfig.base.json" } } }
```

```json path=packages/tsconfig/configs/tsconfig.base.json
{ "compilerOptions": { "paths": { "@acme/*": ["../../*/index.ts"] } } }
```

```json path=packages/tsconfig/base.json
{ "compilerOptions": { "paths": { "@acme/*": ["../legacy/*.ts"] } } }
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

- packages/app/main.ts:1 -> node:ui      # the base is configs/tsconfig.base.json, the file `exports` names; its `@acme/*` alias → packages/ui/index.ts, never packages/legacy/ui.ts
