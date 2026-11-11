---
id: typescript-exports-no-module-settings-bundler-silence
language: typescript
category: import
expectation: silence
cites: "TypeScript 6.0.3 computed options: with neither `module` nor `moduleResolution` set, `moduleResolution` defaults to Bundler, where TypeScript 5 took Node10 for a CommonJS `module` (which reads no `exports`) and Classic otherwise"
---

## Rule

A tsconfig that sets neither `module` nor `moduleResolution` is read as TypeScript 6 computes it: `module` comes from `target` (an ES module kind for every target except `es5`, which gives `commonjs`), and `moduleResolution` from `module` (Bundler here). A `.ts` file then imports, so the `import` branch of `exports` is entered and the `require` branch is passed over. Here the `import` branch names a file that is not there, so nothing binds.

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

- silence      # the import branch's `dist/` file is not there; `require` does not match for an ES module under Bundler

## Why

`moduleResolution` and `module` are computed options in TypeScript 6.0.3: with both unset, `target` defaults to the latest standard, `module` to an ES kind and `moduleResolution` to Bundler. tsc reports this import unresolved. Binding the `require` branch's file would name a file the compiler does not read. TypeScript 5 computed Classic here, which looks no package up at all, so it binds nothing either.
