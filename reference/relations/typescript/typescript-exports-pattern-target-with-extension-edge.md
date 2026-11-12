---
id: typescript-exports-pattern-target-with-extension-edge
language: typescript
category: import
expectation: edge
cites: "Node.js packages `exports` (a subpath pattern's target is taken as written, with `*` replaced)"
---

## Rule

An `exports` pattern whose target writes the extension names the file: `"./util/*": "./util/*.js"` maps `lib/util/thing` to `./util/thing.js`, which exists.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    "./util/*": "./util/*.js"
  }
}
```

```js path=packages/lib/util/thing.js
export const thing = 1;
```

```json path=packages/app/package.json
{ "name": "app", "type": "module", "dependencies": { "lib": "file:../lib" } }
```

```js path=packages/app/use.js
import { thing } from 'lib/util/thing';
console.log(thing);
```

## Expect

- packages/app/use.js:1 -> node:util      # the target as written

## Why

A guard for the case beside it: what the target writes is what is read.
