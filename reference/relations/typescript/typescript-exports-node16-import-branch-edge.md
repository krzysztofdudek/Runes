---
id: typescript-exports-node16-import-branch-edge
language: typescript
category: import
expectation: edge
cites: "TypeScript 6.0.3 getConditions and getImpliedNodeFormatForFile: under moduleResolution NodeNext a `.ts` file whose nearest package.json says `\"type\": \"module\"` is an ES module, resolved with the `import`, `types` and `node` conditions"
---

## Rule

Under `module` and `moduleResolution` NodeNext, a `.ts` file in a package of `"type": "module"` imports with the `import` condition. Of an `exports` entry that lists `require` before `import`, both naming a file, the import branch's file is the one the import binds.

## Files

```json path=packages/lib/package.json
{
  "name": "lib",
  "version": "1.0.0",
  "exports": {
    ".": {
      "require": { "types": "./cjs/index.d.cts" },
      "import": { "types": "./esm/index.d.ts" }
    }
  }
}
```

```ts path=packages/lib/cjs/index.d.cts
export declare const value: number;
```

```ts path=packages/lib/esm/index.d.ts
export declare const value: number;
```

```json path=packages/app/package.json
{ "name": "app", "type": "module", "dependencies": { "lib": "file:../lib" } }
```

```json path=packages/app/tsconfig.json
{ "compilerOptions": { "module": "nodenext", "moduleResolution": "nodenext" } }
```

```ts path=packages/app/use.ts
import { value } from 'lib';
console.log(value);
```

## Expect

- packages/app/use.ts:1 -> node:esm      # the `import` branch: an ES module file under NodeNext; `require` (node:cjs) does not match

## Why

`getImpliedNodeFormatForFile` looks the format of a `.ts` file up in its package.json under the Node resolutions: `"type": "module"` makes it ESNext, so `getConditions` gives `["import", "types", "node"]`. The `require` key is passed over and `import` → `types` names `esm/index.d.ts`.
