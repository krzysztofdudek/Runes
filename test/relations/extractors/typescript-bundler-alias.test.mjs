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
  it('an object entry it cannot read leaves its key unknown, in its place; a key written twice leaves the whole list unknown', () => {
    const entries = read("export default { resolve: { alias: { a: 'x', ...more, [k]: 'y', short, 1: 'z', m() {}, b: 'w' } } };");
    expect(entries[0].map((e) => e.find)).toEqual(['a', undefined, undefined, undefined, undefined, undefined, 'b']);
    expect(read("export default { resolve: { alias: { a: 'x', a: 'y' } } };")).toEqual([[{ exact: false, replacement: UNKNOWN }]]);
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
