---
id: typescript-imports-pattern-target-without-extension-silence
language: typescript
category: trap
expectation: silence
cites: "Node.js packages `imports` (a subpath pattern's target is taken as written, with `*` replaced; it names a file and nothing is added to it); TypeScript module resolution of `imports` targets"
---

## Rule

An `imports` pattern `"#u/*": "./src/u/*"` maps `#u/thing` to the path `./src/u/thing`, and Node and TypeScript look for exactly that file. No file has that name, whatever sits beside it, so the import resolves nothing and gives no edge. A target that writes its extension names the file (`typescript-imports-pattern-target-with-extension-edge`).

## Files

```json path=packages/app/package.json
{ "name": "app", "type": "module", "imports": { "#u/*": "./src/u/*" } }
```

```js path=packages/app/src/u/thing.js
export const thing = 1;
```

```js path=packages/app/use.js
import { thing } from '#u/thing';
console.log(thing);
```

## Expect

- silence      # `./src/u/thing` is no file: the target is taken as written

## Why

An `imports` target is read like an `exports` target (`typescript-exports-pattern-target-without-extension-silence`): probing it the way a relative path is probed bound `src/u/thing.js`, a file the import does not name, which Node and TypeScript do not find.
