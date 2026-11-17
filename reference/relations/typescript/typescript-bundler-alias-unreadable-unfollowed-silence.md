---
id: typescript-bundler-alias-unreadable-unfollowed-silence
language: typescript
category: trap
expectation: silence
cites: "Vite `resolve.alias`: a value the configuration computes (a variable, an imported object) is known only by running it"
---

## Rule

A bundler configuration whose alias cannot be read from its literals may map any bare specifier into the repository. Where the readers cannot tell, a bare specifier that names no dependency of a package.json at or above the file, and no Node built-in, is answered `unfollowed`: it may name a place of the repository. A declared dependency and a built-in still leave the repository. A key the reader can read whose value it cannot (`'@': pathSrc`) leaves only the specifiers that key matches unfollowed.

## Files

```json path=package.json
{ "name": "app", "private": true, "dependencies": { "vue": "^3.4.0" } }
```

```ts path=vite.config.ts
import { defineConfig } from 'vite';

const aliases = Object.fromEntries([['@', '/src']]);

export default defineConfig({ resolve: { alias: aliases } });
```

```ts path=web/vite.config.ts
import path from 'node:path';
const pathSrc = path.resolve(__dirname, './src');
export default { resolve: { alias: { '@': pathSrc } } };
```

```ts path=src/ui/a.ts
import { d } from '@/data/d';
import { ref } from 'vue';
import { readFile } from 'node:fs/promises';
import { join } from 'path';
export const all = [d, ref, readFile, join];
```

```ts path=web/src/ui/w.ts
import { d } from '@/data/d';
import { other } from 'unlisted-package';
export const all = [d, other];
```

## Expect

- silence      # no alias is read, so nothing binds
- src/ui/a.ts:1 answers absent unfollowed
- src/ui/a.ts:2 answers absent outside      # a declared dependency
- src/ui/a.ts:3 answers absent outside      # a Node built-in
- src/ui/a.ts:4 answers absent outside
- web/src/ui/w.ts:1 answers absent unfollowed    # the key `@` is read, its value is not
- web/src/ui/w.ts:2 answers absent outside       # no key matches it
