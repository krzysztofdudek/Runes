---
id: typescript-exports-no-module-settings-first-target-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 computed options: with neither `module` nor `moduleResolution` set, `moduleResolution` defaults to Bundler, where TypeScript 5 took Node10 for a CommonJS `module` (which reads no `exports`) and Classic otherwise"
---

## Rule

When the importing file's settings do not decide the conditions (no tsconfig, or a tsconfig that sets neither `moduleResolution` nor a `module` that implies it), Runes reads `exports` as it did before it read conditions: every target in declaration order, the first that names a file. Here that is the `require` branch's file.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "require": { "types": "./cjs/index.d.cts" },
      "import": { "types": "./dist/index.d.ts" }
    }
  }
}
```

```ts path=packages/lib/cjs/index.d.cts
export declare const value: number;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "compilerOptions": { "strict": true } }
```

```ts path=packages/app/use.ts
import { value } from 'lib';
console.log(value);
```

## Expect

- packages/app/use.ts:1 -> node:cjs      # the first target that names a file, as no setting decides the conditions

## Why

Which conditions apply here depends on the compiler: TypeScript 6 computes Bundler (the `import` branch, which names an unbuilt file, so nothing), TypeScript 5 computes Classic for its default ES `module` (no package lookup at all). Runes does not guess between them and keeps its earlier reading, which can bind a file the compiler in use does not; a tsconfig that names its resolution decides it.
