---
id: javascript-webpack-resolve-alias-edge
language: javascript
category: import
expectation: edge
cites: "webpack `resolve.alias`: a key matches the request itself or the request followed by `/`, and a key ending in `$` the request itself only (enhanced-resolve AliasPlugin)"
---

## Rule

An alias that only the webpack configuration defines is read from its `resolve.alias` when the replacement is `path.resolve(__dirname, '<path>')` or `path.join(__dirname, '<path>')`, from the configuration's directory. `data-alias/d` binds the file under the aliased directory; `config$` matches `config` exactly, so `config` binds the file it names and `config/extra` is no use of that alias. A string replacement that is a bare request (`vue/dist/vue.esm.js`) names a package, and a bare specifier no key matches stays an installed package.

## Files

```json path=package.json
{ "name": "app", "private": true, "dependencies": { "lodash": "^4.17.0", "vue": "^2.7.0" } }
```

```js path=webpack.config.js
const path = require('path');

module.exports = {
  entry: './src/ui/w.js',
  resolve: {
    alias: {
      'data-alias': path.resolve(__dirname, 'src/data'),
      config$: path.join(__dirname, 'src', 'settings', 'config.js'),
      vue$: 'vue/dist/vue.esm.js',
    },
  },
};
```

```js path=src/data/d.js
exports.d = 1;
```

```js path=src/settings/config.js
module.exports = {};
```

```js path=src/ui/w.js
const { d } = require('data-alias/d');
const config = require('config');
const merge = require('lodash/merge');
const Vue = require('vue');
module.exports = [d, config, merge, Vue];
```

## Expect

- src/ui/w.js:1 -> node:data
- src/ui/w.js:2 -> node:settings     # `config$` matches `config` exactly
- src/ui/w.js:3 answers absent outside
- src/ui/w.js:4 answers absent outside    # `vue$` names another request of the package
