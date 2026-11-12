---
id: typescript-exports-pattern-target-without-extension-silence
language: typescript
category: trap
expectation: silence
cites: "Node.js packages `exports` (a subpath pattern's target is taken as written, with `*` replaced; it names a file and nothing is added to it); TypeScript module resolution of `exports` targets"
---

## Rule

An `exports` pattern `"./src/*": "./src/*"` maps `lib/src/thing` to the path `./src/thing`, and Node and TypeScript look for exactly that file. No file has that name, whatever sits beside it, so the import resolves nothing and gives no edge; the same package's `"./util/*": "./util/*.js"` writes the extension in its target and names the file.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    "./src/*": "./src/*"
  }
}
```

```js path=packages/lib/src/thing.js
export const thing = 1;
```

```json path=packages/app/package.json
{ "name": "app", "type": "module", "dependencies": { "lib": "file:../lib" } }
```

```js path=packages/app/use.js
import { thing } from 'lib/src/thing';
console.log(thing);
```

## Expect

- silence      # `./src/thing` is no file: the target is taken as written

## Why

Runes probed the target the way it probes a path and bound `src/thing.js`, a file the import does not name, which Node and TypeScript do not find (40 such edges in react were explained as Flow's reading).
