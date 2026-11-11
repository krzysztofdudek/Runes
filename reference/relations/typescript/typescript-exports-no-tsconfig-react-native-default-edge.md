---
id: typescript-exports-no-tsconfig-react-native-default-edge
language: typescript
category: import
expectation: edge
cites: "Node.js packages `exports` conditional resolution and TypeScript 6.0.3 getConditions: `react-native` is a Metro condition, never a default; use-sync-external-store's `./shim` entry lists `react-native` before `default`"
---

## Rule

A file no tsconfig covers resolves an `exports` entry that lists `react-native` before `default` to its `default` target.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    "./shim": {
      "react-native": "./native/index.js",
      "default": "./shim/index.js"
    }
  }
}
```

```js path=packages/lib/native/index.js
export const value = 1;
```

```js path=packages/lib/shim/index.js
export const value = 2;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```ts path=packages/app/use.ts
import { value } from 'lib/shim';
console.log(value);
```

## Expect

- packages/app/use.ts:1 -> node:shim      # the `default` target; `react-native` is not a default condition

## Why

`react-native` is a condition Metro enters, not Node or TypeScript, so the native build is passed over and `default` names `shim/index.js`.
