---
id: typescript-vite-resolve-alias-edge
language: typescript
category: import
expectation: edge
cites: "Vite `resolve.alias` (an object, or `[{ find, replacement }]`), matched as @rollup/plugin-alias matches a string key: the key itself or the key followed by `/`; create-vue's `fileURLToPath(new URL('./src', import.meta.url))`"
---

## Rule

An alias that only the Vite configuration defines, and no tsconfig `paths` entry, is read from the configuration's `resolve.alias` when its replacement is one of the literal forms a reader can follow without running the file: `fileURLToPath(new URL('<path>', import.meta.url))`, `path.resolve(__dirname, '<path>')` and `path.join(__dirname, '<path>')`, each from the configuration's directory, and a string that starts with `/`, which Vite reads from the project root. The import through the alias binds the file the replaced path names, in a TypeScript file and in a Vue component alike. A bare specifier no key matches (`vue`) is an installed package and leaves the repository.

## Files

```json path=package.json
{ "name": "app", "private": true, "dependencies": { "vue": "^3.4.0" } }
```

```ts path=vite.config.ts
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      { find: '~data', replacement: '/src/data' },
      { find: 'lib', replacement: path.resolve(__dirname, 'src/lib') },
    ],
  },
});
```

```ts path=src/data/d.ts
export const d = 1;
```

```ts path=src/lib/l.ts
export const l = 1;
```

```ts path=src/ui/a.ts
import { d } from '@/data/d';
import { d as e } from '~data/d';
import { l } from 'lib/l';
import { ref } from 'vue';
export const all = [d, e, l, ref];
```

```vue path=src/views/Home.vue
<script setup lang="ts">
import { d } from '@/data/d';
</script>
<template><p>{{ d }}</p></template>
```

## Expect

- src/ui/a.ts:1 -> node:data      # `@` → ./src, from the configuration's directory
- src/ui/a.ts:2 -> node:data      # `/src/data` from the project root, the configuration's directory
- src/ui/a.ts:3 -> node:lib       # path.resolve(__dirname, 'src/lib')
- src/ui/a.ts:4 answers absent outside
- src/views/Home.vue:2 -> node:data

## Why

A Vue or Vite application often keeps its `@` alias in the Vite configuration alone; read as a package, every import through it leaves the repository and a layer check passes over all of them.
