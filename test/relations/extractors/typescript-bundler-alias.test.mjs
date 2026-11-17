// A bare specifier that only a bundler configuration maps: the alias of a Vite, webpack or Babel module-resolver configuration, read from its literals, binds the file it names; a configuration whose alias cannot be read leaves a bare specifier that names no declared dependency unfollowed.
import { describe, it, expect } from '../../helpers/expect.mjs';
import { makeResolver, makeResolvePathToFile, listedFileView, SymbolTable } from '@chrisdudek/runes/relations';

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
