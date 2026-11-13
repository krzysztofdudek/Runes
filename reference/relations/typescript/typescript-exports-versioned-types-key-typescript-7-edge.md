---
id: typescript-exports-versioned-types-key-typescript-7-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 7.0.2 isApplicableVersionedTypesKey (tsc --traceResolution: \"Saw non-matching condition 'types@<7'\", \"Matched 'exports' condition 'types@>=7'\")"
---

## Rule

Runes reads a `types@<range>` key as TypeScript 7 does, whatever TypeScript the project uses: `types@<7` is passed over and `types@>=7` is entered, so its target binds before the plain `types` key.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "types@<7": "./ts6/index.d.ts",
      "types@>=7": "./ts7/index.d.ts",
      "types": "./plain/index.d.ts"
    }
  }
}
```

```ts path=packages/lib/ts6/index.d.ts
export declare const value: number;
```

```ts path=packages/lib/ts7/index.d.ts
export declare const value: number;
```

```ts path=packages/lib/plain/index.d.ts
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

- packages/app/use.ts:1 -> node:ts7      # TypeScript 7 fails `types@<7` and enters `types@>=7`

## Why

The version decides which declarations a project compiled with TypeScript 7 reads; modelling TypeScript 6 bound `ts6/index.d.ts`, which TypeScript 7 passes over.
