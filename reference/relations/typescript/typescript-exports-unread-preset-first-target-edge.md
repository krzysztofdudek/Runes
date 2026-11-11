---
id: typescript-exports-unread-preset-first-target-edge
language: typescript
category: import
expectation: edge
cites: "tsconfig `extends`: the inheriting config takes every option of the base it does not set itself; `@tsconfig/node18` sets `module` node16 and `moduleResolution` node16"
---

## Rule

A tsconfig that extends a preset Runes cannot read (a package that is installed, not committed) inherits settings Runes does not know. `module` and `moduleResolution` are then unknown, not unset: the compiler's defaults do not apply. Runes reads `exports` once for each pairing of the two a project that compiles can have, and binds the file all of those readings name. Where they name different files, as here, it binds the first listed target that one of them names. What the config sets itself is known.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "require": "./cjs/index.cts",
      "import": "./esm/index.mts"
    }
  }
}
```

```ts path=packages/lib/cjs/index.cts
export const value = 1;
```

```ts path=packages/lib/esm/index.mts
export const value = 1;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "extends": "@tsconfig/node18/tsconfig.json", "compilerOptions": { "strict": true } }
```

```ts path=packages/app/use.ts
import { value } from 'lib';
console.log(value);
```

## Expect

- packages/app/use.ts:1 -> node:cjs      # the preset's module settings are unknown and the readings differ, so the first listed target one of them names

## Why

With the preset installed the compiler reads `module` node16 from it, and this CommonJS package (no `"type"`) enters `require`. Reading the config as if the preset set nothing would compute an ES module under Bundler and enter `import`, a file the compiler does not read here. Runes resolves the files of the commit, where an installed package is never present, so it cannot tell which the preset says: a Node resolution enters `require` for this package and Bundler with an ES module enters `import`, and of the two `require` is listed first.
