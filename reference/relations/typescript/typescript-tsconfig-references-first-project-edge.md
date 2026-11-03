---
id: typescript-tsconfig-references-first-project-edge
language: typescript
category: import
expectation: edge
cites: "TS Project References — when several referenced projects include a file, tsserver takes the first one in the order of `references`, so that project's `paths` apply (Apache Airflow's UI: tsconfig.app.json before tsconfig.dev.json)"
---

## Rule

When the nearest tsconfig.json is solution-style and more than one referenced config includes the importing file, the file's `paths` and `baseUrl` come from the first of them in the order of `references`, as tsserver chooses the project that serves a file. A later project that includes the same file, even with other `paths` or none, does not change this. A file that only a later project includes takes that project's options.

## Files

```json path=tsconfig.json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.dev.json" }]
}
```

```json path=tsconfig.app.json
{
  "include": ["src", "tests/**/*.ts"],
  "compilerOptions": { "paths": { "tests/*": ["./tests/*"], "*": ["./*"], "@t/*": ["./tests/*"] } }
}
```

```json path=tsconfig.dev.json
{
  "include": ["./*.ts", "./tests/**/*.ts"],
  "compilerOptions": { "module": "NodeNext" }
}
```

```ts path=tests/helpers/data.ts
export const data = 1;
```

```ts path=tests/spec.ts
import { data } from '@t/helpers/data';
console.log(data);
```

## Expect

- tests/spec.ts:1 -> node:helpers      # `tests/*` from tsconfig.app.json, the first referenced project that includes tests/**/*.ts; tsconfig.dev.json includes it too and has no `paths`
