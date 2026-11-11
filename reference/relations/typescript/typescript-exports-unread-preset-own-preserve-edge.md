---
id: typescript-exports-unread-preset-own-preserve-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 option checks: error 5110, option `module` must be set to `Node16` when option `moduleResolution` is set to `Node16` (and the same for `NodeNext`); under `moduleResolution` Bundler the `node` condition is not entered"
---

## Rule

A tsconfig that extends a preset Runes cannot read (a package that is installed, not committed) and sets `module` preserve itself is read under Bundler whatever the preset says: the compiler accepts a Node resolution only with a Node `module`, and `preserve` is not one. Under Bundler the `node` key of `exports` is passed over, so `default` binds even though `node` is listed first.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "node": "./server/index.ts",
      "default": "./web/index.ts"
    }
  }
}
```

```ts path=packages/lib/server/index.ts
export const value = 1;
```

```ts path=packages/lib/web/index.ts
export const value = 1;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "extends": "@tsconfig/strictest/tsconfig.json", "compilerOptions": { "module": "preserve", "noEmit": true } }
```

```ts path=packages/app/use.ts
import { value } from 'lib';
console.log(value);
```

## Expect

- packages/app/use.ts:1 -> node:web      # module preserve means Bundler, which does not enter node

## Why

`@tsconfig/strictest` sets no module option, so the compiler takes Bundler from `module` preserve and resolves this import to `default`. A preset that named a Node resolution here would make a project the compiler rejects. Taking that reading as possible would leave the lookup on the first listed target, `node`, a file the compiler does not read here.
