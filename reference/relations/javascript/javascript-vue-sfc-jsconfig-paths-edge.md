---
id: javascript-vue-sfc-jsconfig-paths-edge
language: javascript
category: import
expectation: edge
cites: "Volar (Vue language tools) — a component's project is the nearest tsconfig.json or jsconfig.json; create-vue's JavaScript scaffold sets `@/*` in jsconfig.json"
---

## Rule

A Vue component is not a TypeScript file: its project configuration is the nearest tsconfig.json or jsconfig.json, as for a JavaScript file and as Volar reads it. So the `paths` of a jsconfig.json (create-vue's JavaScript scaffold) resolve the component's imports the same way they resolve a `.js` file's.

## Files

```json path=jsconfig.json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } }, "exclude": ["node_modules", "dist"] }
```

```js path=src/stores/counter.js
export const useCounter = () => 0;
```

```js path=src/views/helper.js
import { useCounter } from '@/stores/counter';
export const n = useCounter();
```

```vue path=src/components/Counter.vue
<script setup>
import { useCounter } from '@/stores/counter';
const n = useCounter();
</script>
<template><p>{{ n }}</p></template>
```

## Expect

- src/views/helper.js:1 -> node:stores      # a JavaScript file reads jsconfig.json
- src/components/Counter.vue:2 -> node:stores      # so does a Vue component
