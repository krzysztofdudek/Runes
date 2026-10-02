---
id: typescript-workspace-duplicate-name-silence
language: typescript
category: trap
expectation: silence
cites: "Yggdrasil zero-false-positive rule — two in-repo packages with one name"
---

## Rule

In a repository that declares no workspace, two in-repo package.json files declaring the same `name` (a fixture copy, a vendored fork) make the name ambiguous: the package manager links one of them, and the source cannot say which. The import is silenced. Inside a declared workspace only members count, so a copy outside the workspace globs does not silence the member (see `typescript-workspace-member-beats-fixture-edge`).

## Files

```json path=packages/b/package.json
{ "name": "@acme/b", "main": "./index.ts" }
```

```ts path=packages/b/index.ts
export const X = 1;
```

```json path=fixtures/b/package.json
{ "name": "@acme/b", "main": "./index.ts" }
```

```ts path=fixtures/b/index.ts
export const X = 2;
```

```ts path=packages/a/use.ts
import { X } from '@acme/b';
console.log(X);
```

## Expect

- silence      # `@acme/b` is declared twice in the repository → ambiguous → no edge
