---
id: typescript-bundler-config-composed-unfollowed-silence
language: typescript
category: trap
expectation: silence
cites: "Vite `mergeConfig(defaults, overrides)` and webpack-merge's `merge(...configurations)` merge `resolve.alias` deeply, and a spread copies every key: a configuration composed from another file holds that file's aliases, which are known only by reading it"
---

## Rule

A bundler configuration composed from something the reader does not read may hold an alias although its own text writes none: an export that is a merge (`mergeConfig(base, …)`, webpack-merge's `merge(common, …)`), a spread of another configuration that no key the lookup reads follows, a `require` of another file. Such a configuration is answered as one whose alias cannot be read: a bare specifier that names no dependency of a package.json at or above the file, and no Node built-in, is `unfollowed`, and nothing binds. A configuration the reader reads in full that writes no alias has none, and a bare specifier there is a package that leaves the repository, as before.

## Files

```json path=package.json
{ "name": "app", "private": true, "dependencies": { "vue": "^3.4.0" } }
```

```ts path=vite.base.ts
export default { resolve: { alias: { '@': '/src' } } };
```

```ts path=vite.config.ts
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.base';

export default mergeConfig(base, defineConfig({ plugins: [] }));
```

```ts path=src/data/d.ts
export const d = 1;
```

```ts path=src/ui/a.ts
import { d } from '@/data/d';
import { ref } from 'vue';
export const all = [d, ref];
```

```js path=web/webpack.common.js
const path = require('path');
module.exports = { resolve: { alias: { '@web': path.resolve(__dirname, 'src') } } };
```

```js path=web/webpack.config.js
const { merge } = require('webpack-merge');
const common = require('./webpack.common');

module.exports = merge(common, { mode: 'production' });
```

```ts path=web/src/x.ts
export const x = 1;
```

```ts path=web/src/w.ts
import { x } from '@web/x';
export const all = [x];
```

```js path=lib/babel.shared.js
module.exports = { plugins: [['module-resolver', { alias: { '~data': './src/data' } }]] };
```

```js path=lib/babel.config.js
module.exports = { ...require('./babel.shared') };
```

```ts path=lib/src/l.ts
import { d } from '~data/d';
export const all = [d];
```

```ts path=plain/vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [], build: { outDir: 'build' } });
```

```ts path=plain/src/p.ts
import { other } from '@/other';
export const all = [other];
```

## Expect

- silence      # no configuration is read whole where an alias may come from, so nothing binds
- src/ui/a.ts:1 answers absent unfollowed     # mergeConfig of an imported base
- src/ui/a.ts:2 answers absent outside        # a declared dependency
- web/src/w.ts:1 answers absent unfollowed    # webpack-merge's merge of a required configuration
- lib/src/l.ts:1 answers absent unfollowed    # a spread of a required configuration that nothing follows
- plain/src/p.ts:1 answers absent outside     # read in full, no alias: a package, as before
