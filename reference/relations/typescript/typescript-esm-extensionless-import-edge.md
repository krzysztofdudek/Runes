---
id: typescript-esm-extensionless-import-edge
language: typescript
category: import
expectation: edge
cites: "Jest's resolver (`moduleFileExtensions` lists `mjs`) and bundlers (Vite, webpack, esbuild) resolve an extensionless relative import from an ES module file by trying extensions; Node's own ESM resolver refuses it (ERR_MODULE_NOT_FOUND)"
---

## Rule

An extensionless relative import in an ES module file (`.mjs`, or a package with `"type": "module"`) binds to the file that probing the extensions gives (`../lib/module` to lib/module.mjs), as Jest's resolver and bundlers do. Node's ESM resolver would refuse it, so a project that runs its files with plain Node and no tool in between has no such import; Runes cannot see which tool runs a file, and the tools that read these imports (Jest, Vite, webpack, esbuild, TypeScript under `bundler` resolution) accept them. Giving the edge is the choice; silence would lose every edge of the many projects that bundle or transform their ES modules. Jest's own end-to-end fixtures import this way.

## Files

```json path=package.json
{ "jest": { "moduleFileExtensions": ["js", "json", "mjs"] } }
```

```js path=lib/module.mjs
export const foo = () => 'a';
```

```js path=src/index.mjs
import { foo } from '../lib/module';
foo();
```

## Expect

- src/index.mjs:1 -> node:lib      # `../lib/module` probes the extensions and finds module.mjs, which Jest's resolver does and Node's would refuse
