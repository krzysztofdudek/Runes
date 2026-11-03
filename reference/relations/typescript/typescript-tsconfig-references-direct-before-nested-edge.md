---
id: typescript-tsconfig-references-direct-before-nested-edge
language: typescript
category: import
expectation: edge
cites: "TS Project References — tsserver checks every direct reference of a solution-style tsconfig for the project that holds a file before it looks into the references of any of them (TypeScript 6.0.3)"
---

## Rule

When the nearest tsconfig.json is solution-style, the referenced project that serves a file is the first, in the order of `references`, among the direct references that hold it; only when none of them does are their own references searched, level by level. A project nested under an earlier reference therefore loses to a later direct reference that holds the file.

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
  "references": [{ "path": "./tsconfig.nested.json" }]
}
```

```json path=tsconfig.nested.json
{
  "include": ["src"],
  "compilerOptions": { "paths": { "@/*": ["./wrong/*"] } }
}
```

```json path=tsconfig.b.json
{
  "include": ["src"],
  "compilerOptions": { "paths": { "@/*": ["./lib/*"] } }
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

- src/use.ts:1 -> node:lib      # `@/*` from tsconfig.b.json, a direct reference, not tsconfig.nested.json under the earlier tsconfig.a.json
