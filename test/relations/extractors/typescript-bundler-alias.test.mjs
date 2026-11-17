// A bare specifier that only a bundler configuration maps: the alias of a Vite, webpack or Babel module-resolver configuration, read from its literals, binds the file it names; a configuration whose alias cannot be read leaves a bare specifier that names no declared dependency unfollowed.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { makeResolver, makeResolvePathToFile, listedFileView, SymbolTable } from '@chrisdudek/runes/relations';
import { readBundlerAliases, applyBundlerAliases, combineAliasAnswers } from '../../helpers/internal/relations.mjs';

const resolverOf = (files) => {
  const contents = new Map(Object.entries(files));
  const resolvePathToFile = makeResolvePathToFile('/nonexistent', undefined, undefined, { files: listedFileView(contents.keys(), (p) => contents.get(p)) });
  return makeResolver({ ownerIndex: { ownerOf: (f) => f.split('/').at(-2) }, symbolTable: new SymbolTable(), resolvePathToFile });
};
const use = (r, specifier, fromFile, language = 'typescript') => r.classifyUse([{ kind: 'path', specifier }], fromFile, language);

describe('classifyUse — a bare specifier through a bundler alias', () => {
  it('Vite: resolve.alias read from a string, path.resolve(__dirname) and fileURLToPath(new URL(import.meta.url)) binds the file; an installed package stays outside', () => {
    const r = resolverOf({
      'package.json': '{ "name": "app", "dependencies": { "vue": "^3.4.0" } }',
      'vite.config.ts': [
        "import { fileURLToPath, URL } from 'node:url';",
        "import path from 'node:path';",
        "import { defineConfig } from 'vite';",
        'export default defineConfig({',
        '  resolve: {',
        '    alias: {',
        "      '@': fileURLToPath(new URL('./src', import.meta.url)),",
        "      '~data': '/src/data',",
        "      lib: path.resolve(__dirname, 'src/lib'),",
        '    },',
        '  },',
        '});',
      ].join('\n'),
      'src/data/d.ts': 'export const d = 1;',
      'src/lib/l.ts': 'export const l = 1;',
      'src/ui/a.ts': '',
    });
    expect(use(r, '@/data/d', 'src/ui/a.ts')).toEqual({ kind: 'resolved', owner: 'data', resolvedFile: 'src/data/d.ts' });
    expect(use(r, '~data/d', 'src/ui/a.ts')).toEqual({ kind: 'resolved', owner: 'data', resolvedFile: 'src/data/d.ts' });
    expect(use(r, 'lib/l', 'src/ui/a.ts')).toEqual({ kind: 'resolved', owner: 'lib', resolvedFile: 'src/lib/l.ts' });
    expect(use(r, '@/data/gone', 'src/ui/a.ts')).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(use(r, 'vue', 'src/ui/a.ts')).toEqual({ kind: 'absent', reason: 'outside' });
  });

  it('webpack: resolve.alias read from path.resolve(__dirname) binds the file a require names; an installed package stays outside', () => {
    const r = resolverOf({
      'package.json': '{ "name": "app", "dependencies": { "lodash": "^4.17.0" } }',
      'webpack.config.js': [
        "const path = require('path');",
        'module.exports = {',
        "  resolve: { alias: { 'data-alias': path.resolve(__dirname, 'src/data'), config$: path.join(__dirname, 'src/config.js') } },",
        '};',
      ].join('\n'),
      'src/data/d.js': 'exports.d = 1;',
      'src/config.js': '',
      'src/ui/w.js': '',
    });
    expect(use(r, 'data-alias/d', 'src/ui/w.js', 'javascript')).toEqual({ kind: 'resolved', owner: 'data', resolvedFile: 'src/data/d.js' });
    expect(use(r, 'config', 'src/ui/w.js', 'javascript')).toEqual({ kind: 'resolved', owner: 'src', resolvedFile: 'src/config.js' });
    expect(use(r, 'lodash/merge', 'src/ui/w.js', 'javascript')).toEqual({ kind: 'absent', reason: 'outside' });
  });

  it('Babel: a module-resolver alias in .babelrc binds the file, relative to the configuration; an installed package stays outside', () => {
    const r = resolverOf({
      'package.json': '{ "name": "app", "devDependencies": { "react": "^18.0.0" } }',
      '.babelrc': '{ "plugins": [["module-resolver", { "alias": { "@d": "./src/data" } }]] }',
      'src/data/d.js': 'export const d = 1;',
      'src/ui/b.js': '',
    });
    expect(use(r, '@d/d', 'src/ui/b.js', 'javascript')).toEqual({ kind: 'resolved', owner: 'data', resolvedFile: 'src/data/d.js' });
    expect(use(r, 'react', 'src/ui/b.js', 'javascript')).toEqual({ kind: 'absent', reason: 'outside' });
  });

  it('a configuration whose alias cannot be read leaves a bare specifier that names no declared dependency unfollowed', () => {
    const r = resolverOf({
      'package.json': '{ "name": "app", "dependencies": { "vue": "^3.4.0" } }',
      'vite.config.ts': "import { aliases } from './aliases';\nexport default { resolve: { alias: aliases } };",
      'src/ui/a.ts': '',
    });
    expect(use(r, '@/data/d', 'src/ui/a.ts')).toEqual({ kind: 'absent', reason: 'unfollowed' });
    expect(use(r, 'vue', 'src/ui/a.ts')).toEqual({ kind: 'absent', reason: 'outside' });
    expect(use(r, 'node:fs', 'src/ui/a.ts')).toEqual({ kind: 'absent', reason: 'outside' });
    expect(use(r, 'fs/promises', 'src/ui/a.ts')).toEqual({ kind: 'absent', reason: 'outside' });
  });
});

const read = (text, kind = 'vite', dir = '') => readBundlerAliases(text, kind, dir);
const one = (value, kind = 'vite', prelude = "import path from 'path';\n") => {
  const lists = read(`${prelude}export default { resolve: { alias: { k: ${value} } } };`, kind);
  return lists === 'unknown' ? lists : lists[0][0].replacement;
};
const PATH = (p) => ({ kind: 'path', path: p });
const UNKNOWN = { kind: 'unknown' };

describe('readBundlerAliases — the token reader refuses what it cannot balance', () => {
  it('an unterminated string, comment, template or regular expression, or a bracket that closes another kind, is unknown', () => {
    for (const text of ["const a = 'x", 'const a = "x\ny";', '/* never closed', 'const a = `x', 'const a = `${b`', 'const r = /x', 'const r = /x\n/;', '{ resolve: [ }', '{ resolve: {', '( ]', 'f(}']) {
      expect(read(text)).toBe('unknown');
    }
  });
  it('a shebang line, comments, regular expressions and templates with substitutions are read past', () => {
    expect(read('#!/usr/bin/env node')).toEqual([]);
    const text = [
      '#!/usr/bin/env node',
      "import path from 'node:path';",
      '// alias: nothing here',
      '/* { alias: nothing } */',
      'const vue = /\\.vue$/;',
      "const quote = /['\"{]/g;",
      "const cls = /[/'\\]]/;",
      'function f(x) { return /[}]/.test(x) ? 1 : x / 2 / 3; }',
      'const t = `a${ { b: `c${1}` }.b }d`;',
      'const n = 1.5e3 + .5;',
      'const esc = `a\\`b`;',
      "export default { resolve: { alias: { '@': `/src`, x: `/s${t}` } }, plugins: [...rest] };",
    ].join('\n');
    expect(read(text)).toEqual([[{ find: '@', exact: false, replacement: PATH('src') }, { find: 'x', exact: false, replacement: UNKNOWN }]]);
  });
});

describe('readBundlerAliases — where an alias stands', () => {
  it('an alias that is not a literal object (or array, for Vite) under resolve is one the reader cannot follow', () => {
    expect(read('export default { resolve: { alias } };')).toBe('unknown');
    expect(read("config.resolve.alias = { '@': '/src' };")).toBe('unknown');
    expect(read("import alias from '@rollup/plugin-alias';")).toBe('unknown');
    expect(read("export default { resolveLoader: { alias: { a: 'b' } } };", 'webpack')).toBe('unknown');
    expect(read("export default { test: { alias: { a: 'b' } } };", 'webpack')).toBe('unknown');
    expect(read("export default { alias: { a: 'b' } };")).toBe('unknown');
    expect(read('export default { resolve: { alias: aliases } };')).toEqual([[{ exact: false, replacement: UNKNOWN }]]);
    expect(read("export default { resolve: { alias: { a: 'b' }.x } };")).toEqual([[{ exact: false, replacement: UNKNOWN }]]);
    expect(read("export default { resolve: { alias: [{ find: 'a', replacement: 'b' }] } };", 'webpack')).toEqual([[{ exact: false, replacement: UNKNOWN }]]);
  });
  it('Vite reads test.alias beside resolve.alias, each a list of its own', () => {
    expect(read("export default { resolve: { alias: { a: '/x' } }, test: { alias: { b: '/y' } } };", 'vite', 'web')).toEqual([[{ find: 'a', exact: false, replacement: PATH('web/x') }], [{ find: 'b', exact: false, replacement: PATH('web/y') }]]);
  });
  it('a member of the alias object it cannot read may replace any earlier key, so it leaves the whole object unknown, as a key written twice does; a shorthand member is a key whose value is unknown', () => {
    const UNREADABLE = [[{ exact: false, replacement: UNKNOWN }]];
    for (const member of ['...more', '[k]: \'y\'', '1: \'z\'', 'm() {}', "get '@'() { return '/o'; }", "'\\x40': '/o'", "a: 'y'"]) {
      expect(read(`export default { resolve: { alias: { a: 'x', ${member}, b: 'w' } } };`)).toEqual(UNREADABLE);
    }
    expect(read("export default { resolve: { alias: { a: 'x', short, b: '/w' } } };")[0]).toEqual([
      { find: 'a', exact: false, replacement: { kind: 'request', request: 'x' } },
      { find: 'short', exact: false, replacement: UNKNOWN },
      { find: 'b', exact: false, replacement: PATH('w') },
    ]);
  });
  it('the resolve object and the configuration object around it are read the same way: a member it cannot read, or a key written twice, leaves the alias unknown', () => {
    const UNREADABLE = [[{ exact: false, replacement: UNKNOWN }]];
    for (const text of [
      "export default { resolve: { alias: { a: '/x' }, ...more } };",
      "export default { resolve: { alias: { a: '/x' }, [k]: {} } };",
      "export default { resolve: { alias: { a: '/x' } }, ...overrides };",
      "export default { resolve: { alias: { a: '/x' } }, resolve: {} };",
      "export default { resolve: { alias: { a: '/x' } }, get resolve() { return {}; } };",
      "export default { resolve: { alias: { a: '/x' } }, 'resolv\\u0065': {} };",
      "export default { test: { alias: { a: '/x' } }, resolve };",
    ]) expect(read(text)).toEqual(UNREADABLE);
    expect(read("export default { plugins, resolve: { alias: { a: '/x' }, extensions } };")).toEqual([[{ find: 'a', exact: false, replacement: PATH('x') }]]);
    // A spread before every key the lookup reads cannot replace them: a later key takes the place of what the spread wrote.
    const READ = [[{ find: 'a', exact: false, replacement: PATH('x') }]];
    expect(read("const path = require('path');\nmodule.exports = { ...base, resolve: { ...shared, alias: { a: path.join(__dirname, 'x') } } };", 'webpack')).toEqual(READ);
    expect(read("export default { ...base, resolve: { alias: { a: '/x' } }, test: { environment: 'node' } };")).toEqual(READ);
    expect(read("export default { ...base, resolve: { alias: { a: '/x' } } };")).toEqual([[{ exact: false, replacement: UNKNOWN }]]);
    expect(read("export default { resolve: { ...shared, alias: { a: '/x' }, ...more } };")).toEqual([[{ exact: false, replacement: UNKNOWN }]]);
    expect(read("export default { resolve: { alias: { ...more, a: '/x' } } };")).toEqual([[{ exact: false, replacement: UNKNOWN }]]);
    expect(read("module.exports = { plugins: [['module-resolver', { ...shared, alias: { a: './x' } }]] };", 'babel')).toBe('unknown');
    expect(read("module.exports = { ...base, plugins: [['module-resolver', { alias: { a: './x' } }]] };", 'babel')).toEqual(READ);
  });
  it('an alias under a resolve that is not the configuration\'s own (a webpack rule, a nested object) is one the reader cannot follow', () => {
    expect(read("module.exports = { module: { rules: [{ test: /x/, resolve: { alias: { a: path.resolve(__dirname, 'x') } } }] } };", 'webpack')).toBe('unknown');
    expect(read("export default { environments: { client: { resolve: { alias: { a: '/x' } } } } };")).toBe('unknown');
    expect(read("export default defineConfig(({ mode }) => { const x = 1; return { resolve: { alias: { a: '/x' } } }; });")).toEqual([[{ find: 'a', exact: false, replacement: PATH('x') }]]);
    expect(read("let c;\nif (prod) { c = 1; } else { c = { resolve: { alias: { a: '/x' } } }; }\nexport default c;")).toEqual([[{ find: 'a', exact: false, replacement: PATH('x') }]]);
    expect(read("{ resolve: { alias: { a: '/x' } } }")).toEqual([[{ find: 'a', exact: false, replacement: PATH('x') }]]);
    expect(read("call(x, { resolve: { alias: { a: '/x' } } }, { resolve: { alias: { a: '/x' } }.alias });")).toBe('unknown');
    expect(read("module.exports = [{ resolve: { alias: { a: '/x' } } }, { resolve: { alias: { a: '/x' } } }];", 'vite')).toEqual([[{ find: 'a', exact: false, replacement: PATH('x') }], [{ find: 'a', exact: false, replacement: PATH('x') }]]);
  });
  it('Vite\'s array form reads a string find and a replacement; a regular expression, another property or another element is an unknown key', () => {
    const entries = read("export default { resolve: { alias: [{ find: 'a', replacement: '/x' }, { find: /^b$/, replacement: '/y' }, { find: 'c', replacement: '/z', customResolver: r }, { find: 'd' }, more, { find: 'e', replacement: '/v' }, ] } };");
    expect(entries[0]).toEqual([
      { find: 'a', exact: false, replacement: PATH('x') },
      { exact: false, replacement: UNKNOWN },
      { exact: false, replacement: UNKNOWN },
      { exact: false, replacement: UNKNOWN },
      { exact: false, replacement: UNKNOWN },
      { find: 'e', exact: false, replacement: PATH('v') },
    ]);
  });
  it('a webpack key with a `*` is a pattern, not a name, and is not read', () => {
    expect(read("module.exports = { resolve: { alias: { '@app/*': path.resolve(__dirname, 'src/*') } } };", 'webpack')[0]).toEqual([{ exact: false, replacement: UNKNOWN }]);
  });
  it('keys: webpack\'s name$ matches the name alone; Babel\'s ^ and $ keys are regular expressions; an empty key, one ending in / and one with an escape are not read', () => {
    expect(read("module.exports = { resolve: { alias: { vue$: 'vue/dist/vue.esm.js' } } };", 'webpack')[0]).toEqual([{ find: 'vue', exact: true, replacement: { kind: 'request', request: 'vue/dist/vue.esm.js' } }]);
    expect(read("export default { resolve: { alias: { vue$: 'v' } } };")[0][0].find).toBe('vue$');
    const babel = (key) => read(`{ "plugins": [["module-resolver", { "alias": { "${key}": "./x" } }]] }`, 'babel')[0][0];
    expect(babel('^@(.+)').find).toBeUndefined();
    expect(babel('x$').find).toBeUndefined();
    expect(babel('@d').find).toBe('@d');
    for (const key of ["''", "'@/'", "'a\\\\b'"]) expect(read(`export default { resolve: { alias: { ${key}: '/x' } } };`)[0][0].find).toBeUndefined();
  });
});

describe('readBundlerAliases — the replacement forms', () => {
  it('a string: Vite reads /x from the configuration\'s directory unless the file sets a root; Babel reads ./x and ../x from there; a bare string is another request; anything else is unknown', () => {
    expect(one("'/src'")).toEqual(PATH('src'));
    expect(read("export default { root: 'app', resolve: { alias: { k: '/src' } } };")[0][0].replacement).toEqual(UNKNOWN);
    expect(one("'./src'")).toEqual(UNKNOWN);
    expect(one("'//cdn/x'")).toEqual(UNKNOWN);
    expect(one("'C:/src'")).toEqual(UNKNOWN);
    expect(one("''")).toEqual(UNKNOWN);
    expect(one("'a\\\\b'")).toEqual(UNKNOWN);
    expect(one("'vue/dist/vue.esm-bundler.js'")).toEqual({ kind: 'request', request: 'vue/dist/vue.esm-bundler.js' });
    expect(one("'/src'", 'webpack')).toEqual(UNKNOWN);
    expect(one("'./src'", 'webpack')).toEqual(UNKNOWN);
    const babel = (value, dir = 'pkg') => readBundlerAliases(`module.exports = { plugins: [['module-resolver', { alias: { k: ${value} } }]] };`, 'babel', dir)[0][0].replacement;
    expect(babel("'./src'")).toEqual(PATH('pkg/src'));
    expect(babel("'..'")).toEqual(PATH(''));
    expect(babel("'../../x'")).toEqual(UNKNOWN);
    expect(babel("'/abs'")).toEqual(UNKNOWN);
    expect(babel("'lodash-es'")).toEqual({ kind: 'request', request: 'lodash-es' });
  });
  it('path.resolve and path.join of __dirname and string literals, with path imported from Node', () => {
    expect(one("path.resolve(__dirname, 'src')")).toEqual(PATH('src'));
    expect(one("path.join(__dirname, 'src', 'lib',)")).toEqual(PATH('src/lib'));
    expect(one("path.resolve(__dirname, '..', 'x')")).toEqual(UNKNOWN);
    expect(one("path.resolve(__dirname, 'src')", 'vite', '')).toEqual(UNKNOWN);
    expect(one("path.resolve(__dirname, 'src')", 'vite', "const path = require('node:path');\n")).toEqual(PATH('src'));
    expect(one('path.resolve(__dirname)')).toEqual(UNKNOWN);
    expect(one("path.resolve(__dirname, '/src')")).toEqual(UNKNOWN);
    expect(one("path.resolve(__dirname, '')")).toEqual(UNKNOWN);
    expect(one("path.resolve(__dirname, 'C:x')")).toEqual(UNKNOWN);
    expect(one("path.resolve(__dirname, 'a\\\\b')")).toEqual(UNKNOWN);
    expect(one("path.resolve(__dirname, dir)")).toEqual(UNKNOWN);
    expect(one("path.resolve(process.cwd(), 'src')")).toEqual(UNKNOWN);
    expect(one("path.resolve(__dirname, 'src') + '/x'")).toEqual(UNKNOWN);
    expect(one("path.relative(__dirname, 'src')")).toEqual(UNKNOWN);
    expect(one("resolve(__dirname, 'src')")).toEqual(UNKNOWN);
  });
  it('path.resolve and path.join of __dirname are not read where the configuration declares a __dirname of its own', () => {
    for (const prelude of [
      "import path from 'path';\nconst __dirname = path.resolve('elsewhere');\n",
      "import path from 'path';\nlet __dirname;\n__dirname = 'x';\n",
      "import path from 'path';\nconst make = (__dirname) => 1;\n",
      "import path from 'path';\nfunction make(a, __dirname) {}\n",
      "import path from 'path';\nimport { here as __dirname } from './here';\n",
      "import path from 'path';\nconst { __dirname } = paths;\n",
      "import path from 'path';\nconst make = function (__dirname) {};\n",
    ]) expect(one("path.resolve(__dirname, 'src')", 'vite', prelude)).toEqual(UNKNOWN);
    expect(one("path.resolve(__dirname, 'src')", 'vite', "import path from 'path';\nconst dts = path.resolve(__dirname, 'types');\nif (__dirname === x) {}\n")).toEqual(PATH('src'));
  });
  it('fileURLToPath(new URL(\'<path>\', import.meta.url)), a path relative to the configuration', () => {
    expect(readBundlerAliases("export default { resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } };", 'vite', 'app')[0][0].replacement).toEqual(PATH('app/src'));
    expect(one("fileURLToPath(new URL('src/', import.meta.url))")).toEqual(PATH('src'));
    for (const value of ["'/src'", "'file:///src'", "'./a%20b'", "''", 'dir']) expect(one(`fileURLToPath(new URL(${value}, import.meta.url))`)).toEqual(UNKNOWN);
    expect(one("fileURLToPath(new URL('./src', import.meta.env))")).toEqual(UNKNOWN);
  });
});

describe('readBundlerAliases — Babel module-resolver', () => {
  const babel = (plugins) => read(`module.exports = { plugins: ${plugins} };`, 'babel');
  it('reads the alias of its options; listed by name alone it has none', () => {
    expect(babel("[['babel-plugin-module-resolver', { alias: { '@d': './src/data' }, extensions: ['.js'] }]]")).toEqual([[{ find: '@d', exact: false, replacement: PATH('src/data') }]]);
    expect(babel("['module-resolver']")).toEqual([]);
    expect(babel("['other', 'module-resolver', 'third']")).toEqual([]);
    expect(babel("[['module-resolver', 'name']]")).toEqual([]);
    expect(babel("[['module-resolver', ]]")).toEqual([]);
    expect(babel("[['module-resolver', {}]]")).toEqual([]);
  });
  it('module-resolver under overrides or env, which apply to some files only, is one the reader cannot follow; its options are read the same way as an alias object', () => {
    expect(read("module.exports = { overrides: [{ test: './web', plugins: [['module-resolver', { alias: { '@': './src' } }]] }] };", 'babel')).toBe('unknown');
    expect(read('{ "env": { "test": { "plugins": [["module-resolver", { "alias": { "@": "./src" } }]] } } }', 'babel')).toBe('unknown');
    expect(read("module.exports = { plugins: [['module-resolver', { alias: { '@': './src' }, alias: {} }]] };", 'babel')).toBe('unknown');
    expect(read("module.exports = { plugins: [['module-resolver', { 'ali\\u0061s': {} }]] };", 'babel')).toBe('unknown');
  });
  it('options it cannot see, a root, cwd or resolvePath option, or the plugin named any other way leave the configuration unknown', () => {
    for (const plugins of [
      "[['module-resolver', options]]",
      "[['module-resolver', { alias: {} }, 'name']]",
      "[['module-resolver', { root: ['./src'] }]]",
      "[['module-resolver', { cwd: 'packagejson' }]]",
      "[['module-resolver', { resolvePath() {} }]]",
      "[['module-resolver', { ...shared }]]",
      "[[require.resolve('babel-plugin-module-resolver'), {}]]",
      "{ 'module-resolver': {} }",
    ]) expect(babel(plugins)).toBe('unknown');
    expect(read("module.exports = { alias: { a: './x' } };", 'babel')).toBe('unknown');
  });
});

describe('applyBundlerAliases and combineAliasAnswers', () => {
  const entries = [
    { find: 'exact', exact: true, replacement: PATH('e') },
    { find: 'pkg', exact: false, replacement: { kind: 'request', request: 'real-pkg/dist' } },
    { find: 'up', exact: false, replacement: PATH('') },
    { find: 'dunno', exact: false, replacement: UNKNOWN },
    { exact: false, replacement: UNKNOWN },
    { find: 'late', exact: false, replacement: PATH('l') },
  ];
  it('the first matching entry decides; an unreadable key matches anything after the entries before it', () => {
    expect(applyBundlerAliases('exact', entries)).toEqual(PATH('e'));
    expect(applyBundlerAliases('pkg/sub', entries)).toEqual({ kind: 'request', request: 'real-pkg/dist/sub' });
    expect(applyBundlerAliases('up/../../x', entries)).toEqual(UNKNOWN);
    expect(applyBundlerAliases('dunno/x', entries)).toEqual(UNKNOWN);
    expect(applyBundlerAliases('exact/x', entries)).toEqual(UNKNOWN);
    expect(applyBundlerAliases('late/x', entries)).toEqual(UNKNOWN);
    expect(applyBundlerAliases('late/x', entries.slice(0, 4))).toBeUndefined();
    expect(applyBundlerAliases('pkgs', entries.slice(0, 4))).toBeUndefined();
  });
  it('answers that agree are the answer, answers that differ are unknown, and no answer is no match', () => {
    expect(combineAliasAnswers([undefined, PATH('a'), PATH('a')])).toEqual(PATH('a'));
    expect(combineAliasAnswers([PATH('a'), PATH('b')])).toEqual(UNKNOWN);
    expect(combineAliasAnswers([undefined])).toBeUndefined();
  });
});

describe('makeResolvePathToFile — a later member the reader cannot read gives no false edge', () => {
  const resolverWith = (config, name = 'vite.config.ts') => {
    const contents = new Map(Object.entries({ [name]: config, 'src/x.ts': '', 'other/x.ts': '', 'app/a.ts': '', 'package.json': '{ "name": "app" }' }));
    return makeResolvePathToFile('/nonexistent', undefined, undefined, { files: listedFileView(contents.keys(), (p) => contents.get(p)) });
  };
  it('a spread, computed, escaped or getter member after an alias key binds nothing and answers unfollowed', () => {
    for (const config of [
      "export default { resolve: { alias: { '@': '/src', ...{ '@': '/other' } } } };",
      "export default { resolve: { alias: { '@': '/src', ['@']: '/other' } } };",
      "export default { resolve: { alias: { '@': '/src', '\\x40': '/other' } } };",
      "export default { resolve: { alias: { '@': '/src', get '@'() { return '/other'; } } } };",
      "export default { resolve: { alias: { '@': '/src' }, ...{ alias: { '@': '/other' } } } };",
      "export default { resolve: { alias: { '@': '/src' } }, ...{ resolve: { alias: { '@': '/other' } } } };",
    ]) {
      const r = resolverWith(config);
      expect(r('@/x', 'app/a.ts', 'typescript')).toBeUndefined();
      expect(r.explainMiss('@/x', 'app/a.ts', 'typescript')).toBe('unfollowed');
    }
  });
  it('a webpack rule\'s resolve, a Babel override, a webpack pattern key and a __dirname of the configuration\'s own bind nothing and answer unfollowed', () => {
    const cases = [
      ['webpack.config.js', "const path = require('path');\nmodule.exports = { module: { rules: [{ test: /web/, resolve: { alias: { '@': path.resolve(__dirname, 'src') } } }] } };", '@/x'],
      ['babel.config.js', "module.exports = { overrides: [{ test: './web', plugins: [['module-resolver', { alias: { '@': './src' } }]] }] };", '@/x'],
      ['webpack.config.js', "const path = require('path');\nmodule.exports = { resolve: { alias: { 'lib*': path.resolve(__dirname, 'src') } } };", 'libx'],
      ['webpack.config.js', "const path = require('path');\nconst __dirname = path.resolve('other');\nmodule.exports = { resolve: { alias: { '@': path.resolve(__dirname, '..', 'src') } } };", '@/x'],
    ];
    for (const [name, config, spec] of cases) {
      const r = resolverWith(config, name);
      expect(r(spec, 'app/a.js', 'javascript')).toBeUndefined();
      expect(r.explainMiss(spec, 'app/a.js', 'javascript')).toBe('unfollowed');
    }
  });
  it('a configuration of 20000 configuration objects inside 100000 brackets is read in linear time', () => {
    const configs = Array.from({ length: 20000 }, () => "{ resolve: { alias: { a: '/x' } } }").join(',');
    const r = resolverWith(`const c = ${'('.repeat(100000)}[${configs}]${')'.repeat(100000)};\nexport default c;`);
    const start = performance.now();
    expect(r.explainMiss('@first/x', 'app/a.ts', 'typescript')).toBe('unfollowed');
    expect(performance.now() - start).toBeLessThan(3_000);
  });
  it('a specifier of 5000 segments under 64 alias lists costs a bounded time', () => {
    const lists = Array.from({ length: 64 }, (_, k) => `{ resolve: { alias: { k${k}: '/src', 'a/a': '/src' } } }`).join(',');
    const r = resolverWith(`module.exports = [${lists}];`, 'webpack.config.js');
    const start = performance.now();
    for (let k = 0; k < 4; k++) expect(r(`${'a/'.repeat(5000)}x${k}`, 'app/a.js', 'javascript')).toBeUndefined();
    expect(performance.now() - start).toBeLessThan(500);
  });
  it('a configuration of 131072 alias lists, or one list of 131072 keys, costs each import a bounded time', () => {
    const lists = Array.from({ length: 131072 }, (_, k) => `{ resolve: { alias: { k${k}: '/src' } } }`).join(',');
    const keys = Array.from({ length: 131072 }, (_, k) => `k${k}: '/src'`).join(',');
    for (const config of [`module.exports = [${lists}];`, `module.exports = { resolve: { alias: { ${keys} } } };`]) {
      const r = resolverWith(config, 'webpack.config.js');
      r('@first/x', 'app/a.js', 'javascript');
      const start = performance.now();
      for (let k = 0; k < 2000; k++) r.explainMiss(`spec${k}/x`, 'app/a.js', 'javascript');
      expect(performance.now() - start).toBeLessThan(2_000);
    }
  });
});

describe('makeResolvePathToFile — which bundler configuration a file reads, and in what order', () => {
  const resolverWith = (files, isExcluded) => {
    const contents = new Map(Object.entries(files));
    return makeResolvePathToFile('/nonexistent', undefined, isExcluded, { files: listedFileView(contents.keys(), (p) => contents.get(p)) });
  };
  it('the nearest directory that holds a configuration decides; its configurations must agree; an excluded one is not read', () => {
    const r = resolverWith({
      'vite.config.ts': "export default { resolve: { alias: { '@': '/src' } } };",
      'webpack.config.js': "const path = require('path'); module.exports = { resolve: { alias: { '@': path.resolve(__dirname, 'lib') } } };",
      'app/vite.config.mjs': "export default { resolve: { alias: { '@': '/src' } } };",
      'app/src/x.ts': '',
      'src/x.ts': '',
      'lib/x.ts': '',
      'gen/.babelrc': '{ "plugins": [["module-resolver", { "alias": { "@": "./elsewhere" } }]] }',
      'gen/vite.config.ts': "export default { resolve: { alias: { '@': '/src' } } };",
      'gen/src/x.ts': '',
      'gen/a.ts': '',
    }, (p) => p === 'gen/.babelrc');
    expect(r('@/x', 'app/a.ts', 'typescript')).toBe('app/src/x.ts');
    expect(r('@/x', 'a.ts', 'typescript')).toBeUndefined();
    expect(r.explainMiss('@/x', 'a.ts', 'typescript')).toBe('unfollowed');
    expect(r('@/x', 'gen/a.ts', 'typescript')).toBe('gen/src/x.ts');
  });
  it('a tsconfig paths entry binds before the alias; a # import\'s bare target is not aliased; an alias to a package of the repository binds it', () => {
    const r = resolverWith({
      'package.json': '{ "name": "root", "workspaces": ["packages/*"], "imports": { "#ui": "ui-kit" } }',
      'packages/ui/package.json': '{ "name": "@acme/ui", "main": "./index.ts" }',
      'packages/ui/index.ts': '',
      'tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["./src/*"], "~/*": ["./missing/*"] } } }',
      'vite.config.ts': "export default { resolve: { alias: { '@': '/lib', '~': '/lib', 'ui-kit': '@acme/ui', gone: '@acme/gone' } } };",
      'src/x.ts': '',
      'lib/x.ts': '',
      'lib/y/index.ts': '',
    });
    expect(r('@/x', 'a.ts', 'typescript')).toBe('src/x.ts');
    expect(r('~/x', 'a.ts', 'typescript')).toBe('lib/x.ts');
    expect(r('~/y', 'a.ts', 'typescript')).toBe('lib/y/index.ts');
    expect(r('ui-kit', 'a.ts', 'typescript')).toBe('packages/ui/index.ts');
    expect(r('#ui', 'a.ts', 'typescript')).toBeUndefined();
    expect(r.explainMiss('#ui', 'a.ts', 'typescript')).toBe('outside');
    expect(r('ui-kit/deep', 'a.ts', 'typescript')).toBeUndefined();
    expect(r.explainMiss('ui-kit/deep', 'a.ts', 'typescript')).toBe('unfollowed');
    expect(r.explainMiss('gone', 'a.ts', 'typescript')).toBe('outside');
  });
  it('under an alias it cannot read, a dependency declared by any package.json above the file and a built-in leave the repository', () => {
    const r = resolverWith({
      'package.json': '{ "devDependencies": { "vitest": "^2.0.0" } }',
      'apps/web/package.json': '{ "name": "web", "peerDependencies": { "react": "^18.0.0" } }',
      'apps/web/vite.config.ts': 'export default { resolve: { alias: computed() } };',
    });
    const why = (spec) => r.explainMiss(spec, 'apps/web/src/a.ts', 'typescript');
    expect(why('vitest/config')).toBe('outside');
    expect(why('react')).toBe('outside');
    expect(why('path')).toBe('outside');
    expect(why('@acme/kit')).toBe('unfollowed');
    expect(why('virtual:icons')).toBe('unfollowed');
  });
});
