---
id: typescript-package-self-reference-edge
language: typescript
category: import
expectation: edge
cites: "Node.js packages — self-referencing a package using its name (PACKAGE_SELF_RESOLVE, through `exports`); TypeScript resolves the same under node16, nodenext and bundler"
---

## Rule

Inside a package whose package.json has `exports`, the package's own name resolves through those `exports` before any node_modules lookup, wherever the package sits. A tool outside the workspace globs is linked nowhere, yet its own files import it by name.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=tools/gen/package.json
{ "name": "@acme/gen", "exports": { ".": "./index.ts", "./emit": "./lib/emit.ts" } }
```

```ts path=tools/gen/index.ts
export const gen = 1;
```

```ts path=tools/gen/lib/emit.ts
export const emit = 1;
```

```ts path=tools/gen/src/cli.ts
import { emit } from '@acme/gen/emit';
console.log(emit);
```

## Expect

- tools/gen/src/cli.ts:1 -> node:lib      # self-reference: `./emit` of the package's own `exports` → tools/gen/lib/emit.ts
