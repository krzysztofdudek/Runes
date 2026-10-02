---
id: typescript-workspace-fixture-outside-globs-silence
language: typescript
category: trap
expectation: silence
cites: "npm/yarn `workspaces` and pnpm-workspace.yaml `packages` — only the matched directories are workspace members; Node resolves any other bare name from node_modules"
---

## Rule

Inside a declared workspace (a root package.json `workspaces`, or a pnpm-workspace.yaml `packages` list), a bare specifier binds in the repository only to a workspace member (or to a package the importer's own package.json declares with a `workspace:`, `file:`, `link:` or `portal:` spec). A test fixture's package.json outside the workspace globs is never linked into node_modules, so a fixture named `lodash` is not what `import 'lodash'` loads: the installed dependency is, which is external. No edge.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/resolver/package.json
{ "name": "@acme/resolver", "main": "./index.ts" }
```

```ts path=packages/resolver/index.ts
export const resolve = 1;
```

```json path=packages/resolver/test/fixtures/lodash/package.json
{ "name": "lodash", "main": "./index.js" }
```

```js path=packages/resolver/test/fixtures/lodash/index.js
module.exports = { chunk() {} };
```

```ts path=packages/app/src/index.ts
import { chunk } from 'lodash';
console.log(chunk);
```

## Expect

- silence      # the fixture `lodash` is outside the `packages/*` globs → not a member → the installed dependency, external
