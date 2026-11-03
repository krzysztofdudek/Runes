---
id: typescript-exports-custom-condition-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 5.0+ `customConditions`: the conditions it lists are added to those getConditions gives, so an `exports` key of that name matches (zod exports its source under `@zod/source`)"
---

## Rule

A condition the importing file's tsconfig lists in `customConditions` matches like `import` or `types`: an `exports` key of that name, first in its object, binds the import to its target.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "@acme/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

```ts path=packages/lib/src/index.ts
export const value = 1;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "compilerOptions": { "module": "esnext", "moduleResolution": "bundler", "customConditions": ["@acme/source"] } }
```

```ts path=packages/app/use.ts
import { value } from 'lib';
console.log(value);
```

## Expect

- packages/app/use.ts:1 -> node:src      # `@acme/source` is one of the conditions, and its target is there

## Why

`getConditions` ends with `concatenate(conditions, options.customConditions)`, so the key `@acme/source` matches and names `src/index.ts`. Without the custom condition the same entry binds nothing (`typescript-exports-unmatched-custom-condition-silence`).
