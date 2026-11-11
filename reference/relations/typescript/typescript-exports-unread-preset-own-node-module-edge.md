---
id: typescript-exports-unread-preset-own-node-module-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 option checks: error 5109, option `moduleResolution` must be set to `NodeNext` (or left unspecified) when option `module` is set to `NodeNext`, and error 5095, option `bundler` can only be used when `module` is set to `preserve`, `commonjs`, or `es2015` or later"
---

## Rule

A tsconfig that extends a preset Runes cannot read (a package that is installed, not committed) inherits settings Runes does not know, but what the config sets itself is known, and it narrows the rest: the compiler accepts a Node `module` (`node16`, `node18`, `node20`, `nodenext`) only with a Node resolution. So a config that sets `module` nodenext is read under a Node resolution whatever the preset says, and the nearest package.json decides the format of a `.ts` file: with no `"type": "module"` it requires, and the `require` branch of `exports` binds even though `import` is listed first.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "import": "./esm/index.mts",
      "require": "./cjs/index.cts"
    }
  }
}
```

```ts path=packages/lib/esm/index.mts
export const value = 1;
```

```ts path=packages/lib/cjs/index.cts
export const value = 1;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "extends": "@tsconfig/node20/tsconfig.json", "compilerOptions": { "module": "nodenext", "outDir": "dist" } }
```

```ts path=packages/app/use.ts
import { value } from 'lib';
console.log(value);
```

## Expect

- packages/app/use.ts:1 -> node:cjs      # module nodenext means a Node resolution, and this package is CommonJS

## Why

`@tsconfig/node20` sets `module` node16 and `moduleResolution` node16, and the config overrides `module` with nodenext: the compiler resolves this import in CommonJS mode and enters `require`. A preset that named Bundler here would make a project the compiler rejects, so that reading is not one a project that compiles can have. Taking it as possible would leave the lookup on the first listed target, `import`, a file the compiler does not read here.
