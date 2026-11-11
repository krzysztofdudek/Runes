---
id: typescript-exports-no-tsconfig-react-server-default-edge
language: typescript
category: import
expectation: edge
cites: "Node.js packages `exports` conditional resolution and TypeScript 6.0.3 getConditions: neither enters the `react-server` condition unless it is set as a custom condition; react's packages/react/package.json lists `react-server` before `default`"
---

## Rule

A file no tsconfig covers reads a package's `exports` with Node's default conditions: `import` or `require` by the file's format, `types`, `node` and `default`. A `react-server` key is not among them, so the entry resolves to its `default` target, though the `react-server` target is listed first and names a file that exists.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "react-server": "./server/index.js",
      "default": "./client/index.js"
    }
  }
}
```

```js path=packages/lib/server/index.js
export const value = 1;
```

```js path=packages/lib/client/index.js
export const value = 2;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```ts path=packages/app/use.ts
import { value } from 'lib';
console.log(value);
```

## Expect

- packages/app/use.ts:1 -> node:client      # the `default` target; `react-server` is not a default condition

## Why

Before conditions were read for a file with no tsconfig, Runes took the first target of the entry that names a file, here the server build, which no resolver reads by default. Node and TypeScript match a key only when it is `default` or one of their conditions, so `react-server` is passed over and `default` names `client/index.js`. The corpus oracle agrees on react's `packages/react`.
