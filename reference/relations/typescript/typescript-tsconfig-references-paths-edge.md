---
id: typescript-tsconfig-references-paths-edge
language: typescript
category: import
expectation: edge
cites: "TS Project References — a solution-style tsconfig.json (`files: []` plus `references`); tsserver and `tsc -b` take a file's options from the referenced project whose `include`/`files` hold it (create-vue and Vite scaffolds)"
---

## Rule

When the nearest tsconfig.json does not include the importing file and has `references` (the solution-style root create-vue and Vite generate), the file's `paths` and `baseUrl` come from the referenced config whose `files`, or `include` minus `exclude`, holds it, as tsserver and `tsc -b` read it. The `@/*` alias of tsconfig.app.json therefore resolves in a `.ts` file and in a `.vue` component alike; a file no referenced config includes keeps the nearest config's options.

## Files

```json path=tsconfig.json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.app.json" }]
}
```

```json path=tsconfig.node.json
{ "include": ["vite.config.*"], "compilerOptions": { "composite": true } }
```

```json path=tsconfig.app.json
{
  "include": ["env.d.ts", "src/**/*", "src/**/*.vue"],
  "exclude": ["src/**/__tests__/*"],
  "compilerOptions": { "composite": true, "paths": { "@/*": ["./src/*"] } }
}
```

```ts path=src/utils/fmt.ts
export const fmt = (n: number) => n.toFixed(2);
```

```ts path=src/views/Home.ts
import { fmt } from '@/utils/fmt';
console.log(fmt(1));
```

```vue path=src/cart/Cart.vue
<template><p>{{ fmt(2) }}</p></template>
<script setup lang="ts">
import { fmt } from '@/utils/fmt';
</script>
```

## Expect

- src/views/Home.ts:1 -> node:utils      # `@/*` from tsconfig.app.json, the referenced project that includes src/**/*
- src/cart/Cart.vue:3 -> node:utils      # the same project includes src/**/*.vue
