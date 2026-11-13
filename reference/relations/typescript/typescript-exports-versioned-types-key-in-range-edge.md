---
id: typescript-exports-versioned-types-key-in-range-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 7.0.2 isApplicableVersionedTypesKey: a `types@<range>` key whose range the compiler's version satisfies is entered like `types`"
---

## Rule

A `types@<range>` key whose range the TypeScript version satisfies is entered, so its target binds before a later plain `types` key. Here `types@>=5.0` holds for TypeScript 7.0.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "types@>=5.0": "./modern/index.d.ts",
      "types": "./legacy/index.d.ts"
    }
  }
}
```

```ts path=packages/lib/modern/index.d.ts
export declare const value: number;
```

```ts path=packages/lib/legacy/index.d.ts
export declare const value: number;
```

```json path=packages/app/package.json
{ "name": "app", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "compilerOptions": { "module": "esnext", "moduleResolution": "bundler" } }
```

```ts path=packages/app/use.ts
import { value } from 'lib';
console.log(value);
```

## Expect

- packages/app/use.ts:1 -> node:modern      # `types@>=5.0` holds for this TypeScript version

## Why

A satisfied versioned key is entered in declaration order, and its target is the first that names a file, so `modern/index.d.ts` binds before the plain `types` key is read.
