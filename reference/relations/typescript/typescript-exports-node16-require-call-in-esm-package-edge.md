---
id: typescript-exports-node16-require-call-in-esm-package-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 getModeForUsageLocation: a `require()` call is resolved in CommonJS mode whatever the format of the file that holds it, so it matches the `require` condition"
---

## Rule

Under `module` Node16, a `require()` call in a file of an ES module package selects the `require` condition, where an import statement in the same file would select `import`. Of an entry that lists `import` first, the `require` branch's file binds.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "import": "./esm/index.mjs",
      "require": "./cjs/index.cjs"
    }
  }
}
```

```js path=packages/lib/esm/index.mjs
export const value = 1;
```

```js path=packages/lib/cjs/index.cjs
exports.value = 2;
```

```json path=packages/app/package.json
{ "name": "app", "type": "module", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "compilerOptions": { "module": "node16", "allowJs": true } }
```

```js path=packages/app/use.js
const lib = require('lib');
console.log(lib.value);
```

## Expect

- packages/app/use.js:1 -> node:cjs      # `require()` enters `require` whatever the file's format

## Why

The package is an ES module, so an import statement in `use.js` would enter `import`; a `require()` call is resolved in CommonJS mode, `getConditions` gives `require`, `types` and `node`, and `import` is passed over.
