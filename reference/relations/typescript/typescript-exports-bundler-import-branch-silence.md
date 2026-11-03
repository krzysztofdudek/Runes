---
id: typescript-exports-bundler-import-branch-silence
language: typescript
category: import
expectation: silence
cites: "TypeScript 6.0.3 getConditions: under moduleResolution Bundler an import is resolved with the `import` and `types` conditions (and `default`); loadModuleFromTargetExportOrImport reads a conditions object's keys in order and skips a key whose condition is not among them (next-intl's e2e and example apps import `next-intl/plugin`, whose import branch names unbuilt `dist/` files)"
---

## Rule

Under `moduleResolution` Bundler the conditions are `import`, `types` and `default`. A package's `exports` entry whose `import` branch names files that are not there and whose `require` branch names one that is resolves to nothing: the `require` key does not match, and the trailing `default` names an unbuilt file too. The import gives no edge, though a file of the `require` branch exists.

## Files

```yaml path=pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    "./plugin": {
      "import": { "types": "./dist/types/plugin.d.ts", "default": "./dist/esm/plugin.js" },
      "require": { "types": "./plugin.d.cts", "default": "./dist/cjs/plugin.cjs" },
      "default": "./dist/esm/plugin.js"
    }
  }
}
```

```ts path=packages/lib/plugin.d.cts
export declare function createPlugin(): void;
```

```json path=apps/web/package.json
{ "name": "web", "type": "module", "dependencies": { "lib": "workspace:*" } }
```

```json path=apps/web/tsconfig.json
{ "compilerOptions": { "module": "esnext", "moduleResolution": "bundler" } }
```

```ts path=apps/web/next.config.ts
import { createPlugin } from 'lib/plugin';
createPlugin();
```

## Expect

- silence      # the import branch's `dist/` files are not there; `require` does not match under Bundler

## Why

`getConditions` returns `["import", "types"]` for Bundler (it adds `node` only for the other resolutions), and `loadModuleFromTargetExportOrImport` enters a key only when it is `default` or one of those conditions: here `import` (its two targets name no file), then `default` (no file); `require` is passed over. tsc reports the import unresolved, and the corpus oracle agrees on next-intl's eleven such imports.
