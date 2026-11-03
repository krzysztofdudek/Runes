---
id: typescript-exports-unmatched-custom-condition-silence
language: typescript
category: import
expectation: silence
cites: "TypeScript 6.0.3 loadModuleFromTargetExportOrImport: a key that is neither `default` nor one of the conditions is passed over (zod's packages export their source only under `@zod/source`, and a project that does not set it finds the unbuilt `dist/`)"
---

## Rule

An `exports` key named by no condition of the importing file's settings is passed over even when its target is there. When the keys that do match name only unbuilt files, the import binds nothing.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "@acme/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

```ts path=packages/lib/src/index.ts
export const value = 1;
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

- silence      # `@acme/source` is no condition here, and `types` and `default` name unbuilt files

## Why

Under Bundler the conditions are `import`, `types` and `default`; `@acme/source` is not among them, so its target is never read, and `dist/` is not there.
