---
id: typescript-exports-no-tsconfig-esm-package-import-branch-edge
language: typescript
category: import
expectation: edge
cites: "Node.js packages `exports` conditional resolution: a `.js` file whose nearest package.json sets `\"type\": \"module\"` is an ES module and imports with the `import` condition; one without `type` is CommonJS and requires"
---

## Rule

A file no tsconfig covers takes its format as Node does: a `.js` or `.ts` file in a package with `"type": "module"` imports, so of an entry that lists `require` before `import` the `import` target binds.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "require": "./cjs/index.cjs",
      "import": "./esm/index.mjs"
    }
  }
}
```

```js path=packages/lib/cjs/index.cjs
exports.value = 1;
```

```js path=packages/lib/esm/index.mjs
export const value = 2;
```

```json path=packages/app/package.json
{ "name": "app", "type": "module", "dependencies": { "lib": "file:../lib" } }
```

```js path=packages/app/use.js
import { value } from 'lib';
console.log(value);
```

## Expect

- packages/app/use.js:1 -> node:esm      # the `import` target: the file's package is an ES module

## Why

With no tsconfig the format comes from the nearest package.json, as Node reads it: `"type": "module"` makes `use.js` an ES module, its import enters `import`, and `require` is passed over.
