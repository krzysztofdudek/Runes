---
id: typescript-exports-no-tsconfig-edge-light-default-edge
language: typescript
category: import
expectation: edge
cites: "Node.js packages `exports` conditional resolution and TypeScript 6.0.3 getConditions: `edge-light`, `worker` and `workerd` are runtime conditions a bundler sets, never a default; react-dom's packages/react-dom/package.json lists them before `default` for `./server`"
---

## Rule

A file no tsconfig covers resolves a subpath whose `exports` entry lists the runtime keys `edge-light` and `worker` before `default` to its `default` target.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    "./server": {
      "edge-light": "./edge/server.js",
      "worker": "./edge/server.js",
      "default": "./node/server.js"
    }
  }
}
```

```js path=packages/lib/edge/server.js
export const render = 1;
```

```js path=packages/lib/node/server.js
export const render = 2;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```ts path=packages/app/use.ts
import { render } from 'lib/server';
console.log(render);
```

## Expect

- packages/app/use.ts:1 -> node:node      # the `default` target; `edge-light` and `worker` are runtime conditions, not defaults

## Why

Neither `edge-light` nor `worker` is among the conditions Node and TypeScript enter, so the edge build is passed over and `default` names `node/server.js`.
