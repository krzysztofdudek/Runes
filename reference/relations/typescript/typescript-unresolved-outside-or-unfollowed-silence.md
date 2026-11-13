---
id: typescript-unresolved-outside-or-unfollowed-silence
language: typescript
category: trap
expectation: silence
cites: "TypeScript module resolution (relative paths, `paths`, workspace packages, then `node_modules`)"
---

## Rule

A use that binds no file of the repository is told apart by where it points. An installed package, or a subpath of one, leaves the repository: the answer is absent, `outside`. A relative path with no file, a `paths` alias the tsconfig sets, and a subpath of a workspace package of the repository point into the repository and bind nothing: the answer is absent, `unfollowed`.

## Files

```json path=package.json
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
```

```json path=packages/lib/package.json
{ "name": "@acme/lib", "main": "./index.ts" }
```

```ts path=packages/lib/index.ts
export const lib = 1;
```

```json path=packages/app/tsconfig.json
{ "compilerOptions": { "module": "esnext", "moduleResolution": "bundler", "paths": { "@/*": ["./src/*"] } } }
```

```ts path=packages/app/src/main.ts
import React from 'react';
import merge from 'lodash/merge';
import { missing } from './missing';
import { gone } from '@/gone';
import { deep } from '@acme/lib/deep';
console.log(React, merge, missing, gone, deep);
```

## Expect

- silence      # nothing binds a file of the repository
- packages/app/src/main.ts:1 answers absent outside
- packages/app/src/main.ts:2 answers absent outside
- packages/app/src/main.ts:3 answers absent unfollowed
- packages/app/src/main.ts:4 answers absent unfollowed
- packages/app/src/main.ts:5 answers absent unfollowed

## Why

A consumer that reports what it could not follow and stays quiet about what leaves the repository cannot tell the two from `absent` alone.
