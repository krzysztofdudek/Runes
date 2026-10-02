---
id: javascript-svelte-jsconfig-paths-edge
language: javascript
category: import
expectation: edge
cites: "svelte-check and the Svelte language server — a component's project is the nearest tsconfig.json or jsconfig.json"
---

## Rule

A Svelte component reads the nearest tsconfig.json or jsconfig.json, as a JavaScript file does, so the `paths` of a jsconfig.json resolve its imports.

## Files

```json path=jsconfig.json
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
```

```js path=src/stores/counter.js
export const count = 0;
```

```svelte path=src/widgets/Widget.svelte
<script>
  import { count } from '@/stores/counter';
</script>
<p>{count}</p>
```

## Expect

- src/widgets/Widget.svelte:2 -> node:stores      # jsconfig.json `@/*` → src/stores/counter.js
