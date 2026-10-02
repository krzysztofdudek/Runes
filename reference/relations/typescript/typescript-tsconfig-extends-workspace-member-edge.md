---
id: typescript-tsconfig-extends-workspace-member-edge
language: typescript
category: import
expectation: edge
cites: "TS tsconfig `extends` naming a package — resolved like a module from node_modules, where npm/yarn/pnpm link only workspace members"
---

## Rule

A tsconfig `extends` that names a package (`@acme/tsconfig`) is read from node_modules, as a bare import is, and inside a declared workspace the package manager links only the members there. So the shared base config is the workspace member with that name; a test fixture outside the workspace globs that copies the name is not linked, does not make the name ambiguous, and does not hide the member's `paths`.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/tsconfig/package.json
{ "name": "@acme/tsconfig", "version": "1.0.0" }
```

```json path=packages/tsconfig/tsconfig.json
{ "compilerOptions": { "paths": { "@acme/*": ["../*/index.ts"] } } }
```

```json path=fixtures/tsconfig/package.json
{ "name": "@acme/tsconfig", "version": "0.0.0" }
```

```json path=fixtures/tsconfig/tsconfig.json
{ "compilerOptions": { "paths": { "@acme/*": ["./fake/*"] } } }
```

```json path=packages/app/tsconfig.json
{ "extends": "@acme/tsconfig" }
```

```ts path=packages/ui/index.ts
export const Button = 1;
```

```ts path=packages/app/main.ts
import { Button } from '@acme/ui';
console.log(Button);
```

## Expect

- packages/app/main.ts:1 -> node:ui      # the base is the member packages/tsconfig; its `@acme/*` alias → packages/ui/index.ts
