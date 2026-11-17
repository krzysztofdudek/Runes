---
id: javascript-babel-module-resolver-alias-edge
language: javascript
category: import
expectation: edge
cites: "babel-plugin-module-resolver `alias`: a key matches the specifier itself or the specifier followed by `/` (`^` keys are regular expressions), and a relative value is read from the working directory (`cwd`, by default the directory Babel runs in), which the reader takes to be the configuration's directory"
---

## Rule

An alias that only a Babel configuration defines is read from the options of `module-resolver` in `.babelrc`, `.babelrc.json` or `babel.config.*`: a string value that starts with `./` or `../` names a place relative to module-resolver's working directory, which the reader takes to be the configuration's directory, where Babel runs. `@d/d` binds the file under `src/data`; an installed package stays outside.

## Files

```json path=package.json
{ "name": "app", "private": true, "devDependencies": { "react": "^18.0.0", "babel-plugin-module-resolver": "^5.0.0" } }
```

```json path=.babelrc
{
  "presets": ["@babel/preset-env"],
  "plugins": [
    ["module-resolver", { "alias": { "@d": "./src/data" } }]
  ]
}
```

```js path=src/data/d.js
export const d = 1;
```

```js path=src/ui/b.js
import { d } from '@d/d';
import React from 'react';
export const all = [d, React];
```

## Expect

- src/ui/b.js:1 -> node:data
- src/ui/b.js:2 answers absent outside
