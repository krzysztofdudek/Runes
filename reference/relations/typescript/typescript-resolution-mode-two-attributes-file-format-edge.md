---
id: typescript-resolution-mode-two-attributes-file-format-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 getModeForUsageLocation (an import attribute list that holds more than the one `resolution-mode` entry is reported, and the module is resolved by the format of its file)"
---

## Rule

An attribute list of two entries is not a `resolution-mode` attribute: the compiler reports the list and resolves the import by the format of its file. In a `.mts` file that is `import`, so the `import` branch's file binds, whatever the `resolution-mode` entry says.

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
export type T = number;
```

```ts path=packages/lib/cjs/index.cts
export const value = 2;
export type T = number;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "compilerOptions": { "module": "nodenext" } }
```

```ts path=packages/app/use.mts
import type { T } from 'lib' with { 'resolution-mode': 'require', 'extra': 'x' };
export type U = T;
```

## Expect

- packages/app/use.mts:1 -> node:esm      # two entries: the format of the file decides, `import`

## Why

The first entry of the list was taken as the mode, so the `require` branch's file bound where the compiler resolves by the file.
