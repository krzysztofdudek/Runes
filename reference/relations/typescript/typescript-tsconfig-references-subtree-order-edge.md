---
id: typescript-tsconfig-references-subtree-order-edge
language: typescript
category: import
expectation: edge
cites: "TS Project References — tsserver (TypeScript 6.0.3, forEachResolvedProjectReferenceProjectLoad) checks every direct reference of a config, then searches the whole reference tree of each of them in turn, so a project two levels under the first reference wins over a project one level under the second"
---

## Rule

When the nearest tsconfig.json is solution-style, the project that serves a file is found as tsserver finds it: the direct references in their order, then, for each direct reference in turn, the same search through its own references, finished before the next direct reference's references are looked at. A project deep under the first reference therefore wins over a shallower project under a later one; a search level by level would take the shallower one.

## Files

```json path=tsconfig.json
{
  "files": [],
  "references": [{ "path": "./tsconfig.a.json" }, { "path": "./tsconfig.b.json" }]
}
```

```json path=tsconfig.a.json
{
  "files": [],
  "references": [{ "path": "./tsconfig.a1.json" }]
}
```

```json path=tsconfig.a1.json
{
  "files": [],
  "references": [{ "path": "./tsconfig.a2.json" }]
}
```

```json path=tsconfig.a2.json
{
  "include": ["src"],
  "compilerOptions": { "paths": { "@/*": ["./lib/*"] } }
}
```

```json path=tsconfig.b.json
{
  "files": [],
  "references": [{ "path": "./tsconfig.b1.json" }]
}
```

```json path=tsconfig.b1.json
{
  "include": ["src"],
  "compilerOptions": { "paths": { "@/*": ["./wrong/*"] } }
}
```

```ts path=lib/value.ts
export const value = 1;
```

```ts path=wrong/value.ts
export const value = 2;
```

```ts path=src/use.ts
import { value } from '@/value';
console.log(value);
```

## Expect

- src/use.ts:1 -> node:lib      # `@/*` from tsconfig.a2.json, found in the tree of the first reference before the tree of the second is searched

## Why

tsserver's `forEachResolvedProjectReferenceProjectLoad` runs the callback over `parentConfig.projectReferences` in order, collecting each child config, and only then, `|| forEach(children, (childConfig) => … forEachResolvedProjectReferenceProjectLoad(project, childConfig, cb, …))`, recurses into each child's references one child at a time. With the references above the order is tsconfig.a.json, tsconfig.b.json, tsconfig.a1.json, tsconfig.a2.json, tsconfig.b1.json, so tsconfig.a2.json serves `src/use.ts`.
