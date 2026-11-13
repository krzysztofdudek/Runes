---
id: typescript-imports-pattern-target-with-extension-edge
language: typescript
category: import
expectation: edge
cites: "Node.js packages `imports` (a subpath pattern's target is taken as written, with `*` replaced); TypeScript module resolution of `imports` targets"
---

## Rule

An `imports` pattern whose target writes the extension, `"#w/*": "./src/w/*.js"`, maps `#w/thing` to `./src/w/thing.js`, the file itself, so the import binds it.

## Files

```json path=packages/app/package.json
{ "name": "app", "type": "module", "imports": { "#w/*": "./src/w/*.js" } }
```

```js path=packages/app/src/w/thing.js
export const thing = 1;
```

```js path=packages/app/use.js
import { thing } from '#w/thing';
console.log(thing);
```

## Expect

- packages/app/use.js:1 -> node:w      # `#w/*` → src/w/thing.js, the file the target names

## Why

Reading an `imports` target as written (`typescript-imports-pattern-target-without-extension-silence`) must not lose the target that names its file.
