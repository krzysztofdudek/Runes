---
id: typescript-exports-versioned-types-key-out-of-range-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 7.0.2 isApplicableVersionedTypesKey: a `types@<range>` key is entered only when the compiler's version satisfies the range, and is passed over otherwise"
---

## Rule

A `types@<range>` key whose range the TypeScript version fails is skipped, and the lookup goes on to the next key. Here `types@>=99` fails and the plain `types` key binds.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "types@>=99": "./future/index.d.ts",
      "types": "./current/index.d.ts"
    }
  }
}
```

```ts path=packages/lib/future/index.d.ts
export declare const value: number;
```

```ts path=packages/lib/current/index.d.ts
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

- packages/app/use.ts:1 -> node:current      # `types@>=99` is out of range for this TypeScript version

## Why

`loadModuleFromTargetExportOrImport` enters a versioned key only when `isApplicableVersionedTypesKey` holds, that is when the range accepts the compiler's major and minor version. TypeScript 7.0 fails `>=99`, so the next key, `types`, binds.
