// Moved from Yggdrasil source/cli/tests/unit/relations/extractors/typescript-resolve.test.ts (vitest) to node:test; the assertions are unchanged.
import { describe, it, expect, afterEach } from '../../helpers/expect.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveTsPath, makeTsResolveDeps, parseJsonc,
} from '../../helpers/internal/relations.mjs';
import { makeResolvePathToFile } from '@chrisdudek/runes/relations';

// `exists` predicate over a fixed set of repo-relative POSIX files.
const known = new Set([
  'src/io/graph-fs.ts',
  'src/util/u.ts',
  'src/util/index.ts',
  'src/a/b.tsx',
  'src/m/m.js',
  'src/comp/widget.tsx',
]);
const exists = (p) => known.has(p);

describe('resolveTsPath', () => {
  it('rewrites a .js specifier to the .ts source (NodeNext)', () => {
    expect(resolveTsPath('../io/graph-fs.js', 'src/core/migrator.ts', exists)).toBe('src/io/graph-fs.ts');
  });
  it('appends an extension when none given', () => {
    expect(resolveTsPath('../util/u', 'src/core/x.ts', exists)).toBe('src/util/u.ts');
  });
  it('resolves a directory import to its index', () => {
    expect(resolveTsPath('../util', 'src/core/x.ts', exists)).toBe('src/util/index.ts');
  });
  it('resolves a .tsx target', () => {
    expect(resolveTsPath('../a/b.js', 'src/core/x.ts', exists)).toBe('src/a/b.tsx');
  });
  it('resolves a plain .js source when no .ts exists', () => {
    expect(resolveTsPath('../m/m.js', 'src/core/x.ts', exists)).toBe('src/m/m.js');
  });
  it('probes a declaration file after the sources, the way the compiler does', () => {
    const decl = new Set(['src/t/types.d.ts', 'src/u/api.d.ts', 'src/v/esm.d.mts', 'src/w/index.d.ts', 'src/x/both.ts', 'src/x/both.d.ts']);
    const has = (p) => decl.has(p);
    expect(resolveTsPath('../t/types', 'src/app/a.ts', has)).toBe('src/t/types.d.ts');
    expect(resolveTsPath('../u/api.js', 'src/app/a.ts', has)).toBe('src/u/api.d.ts');
    expect(resolveTsPath('../v/esm.mjs', 'src/app/a.ts', has)).toBe('src/v/esm.d.mts');
    expect(resolveTsPath('../w', 'src/app/a.ts', has)).toBe('src/w/index.d.ts');
    // A source file beats its declaration file.
    expect(resolveTsPath('../x/both', 'src/app/a.ts', has)).toBe('src/x/both.ts');
  });
  it('returns undefined for a non-existent target', () => {
    expect(resolveTsPath('./nope', 'src/core/x.ts', exists)).toBeUndefined();
  });
  it('returns undefined for a bare specifier when no project configuration is given', () => {
    expect(resolveTsPath('zod', 'src/core/x.ts', exists)).toBeUndefined();
  });
  it('normalizes .. segments correctly', () => {
    expect(resolveTsPath('./../util/u.js', 'src/core/x.ts', exists)).toBe('src/util/u.ts');
  });
  it('uses an explicit .ts extension as-is (no rewrite, no index fallback needed)', () => {
    expect(resolveTsPath('../util/u.ts', 'src/core/x.ts', exists)).toBe('src/util/u.ts');
  });
  it('uses an explicit .tsx extension as-is', () => {
    expect(resolveTsPath('../comp/widget.tsx', 'src/core/x.ts', exists)).toBe('src/comp/widget.tsx');
  });
});

// ─── Project-configuration rules, driven through the real disk-backed deps ─────────────
const roots = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});
function materialize(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'yg-tsres-'));
  roots.push(root);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
  return root;
}
function project(files, isExcluded) {
  const root = materialize(files);
  const isFile = (p) => {
    try {
      return statSync(path.join(root, p)).isFile();
    } catch {
      return false;
    }
  };
  const deps = makeTsResolveDeps(root, isExcluded);
  return (spec, from) => resolveTsPath(spec, from, isFile, deps);
}

describe('resolveTsPath — tsconfig', () => {
  it('silences every bare specifier when the tsconfig cannot be read (it may remap them)', () => {
    const r = project({
      'tsconfig.json': '{ "compilerOptions": { "paths": ',
      'packages/b/package.json': '{ "name": "@acme/b", "main": "./index.ts" }',
      'packages/b/index.ts': '',
    });
    expect(r('@acme/b', 'src/a.ts')).toBeUndefined();
  });
  it('treats a missing RELATIVE extends as unknown, and an uninstalled PACKAGE preset as contributing nothing', () => {
    const missing = project({ 'tsconfig.json': '{ "extends": "./nope.json", "compilerOptions": { "baseUrl": "." } }', 'src/x.ts': '' });
    expect(missing('src/x', 'src/a.ts')).toBeUndefined();
    const preset = project({ 'tsconfig.json': '{ "extends": "@tsconfig/node20/tsconfig.json", "compilerOptions": { "baseUrl": "." } }', 'src/x.ts': '' });
    expect(preset('src/x', 'src/a.ts')).toBe('src/x.ts');
  });
  it('reads an installed package preset from node_modules and an extends array in order', () => {
    const r = project({
      'node_modules/@acme/tsconfig/tsconfig.json': '{ "compilerOptions": { "paths": { "@x/*": ["./ignored/*"] } } }',
      'base.json': '{ "compilerOptions": { "paths": { "@x/*": ["./src/*"] } } }',
      'tsconfig.json': '{ "extends": ["@acme/tsconfig", "./base.json"] }',
      'src/y.ts': '',
    });
    expect(r('@x/y', 'app/a.ts')).toBe('src/y.ts');
  });
  it('reads an extends cycle as unknown instead of recursing', () => {
    const r = project({ 'tsconfig.json': '{ "extends": "./b.json" }', 'b.json': '{ "extends": "./tsconfig.json" }', 'src/x.ts': '' });
    expect(r('src/x', 'src/a.ts')).toBeUndefined();
  });
  it('resolves paths from baseUrl when one is in effect, else from the declaring config', () => {
    const r = project({
      'cfg/base.json': '{ "compilerOptions": { "paths": { "@/*": ["./*"] } } }',
      'tsconfig.json': '{ "extends": "./cfg/base.json", "compilerOptions": { "baseUrl": "./src" } }',
      'src/m.ts': '',
      'cfg/m.ts': '',
    });
    expect(r('@/m', 'src/a.ts')).toBe('src/m.ts');
  });
  it('expands ${configDir} to the directory of the tsconfig in effect', () => {
    const r = project({
      'shared/tsconfig.base.json': '{ "compilerOptions": { "paths": { "~/*": ["${configDir}/src/*"] } } }',
      'apps/web/tsconfig.json': '{ "extends": "../../shared/tsconfig.base.json" }',
      'apps/web/src/m.ts': '',
    });
    expect(r('~/m', 'apps/web/src/a.ts')).toBe('apps/web/src/m.ts');
  });
  it('prefers the exact paths key, then the longest wildcard prefix', () => {
    const r = project({
      'tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["./a/*"], "@/lib/*": ["./b/*"], "@/lib/x": ["./c/x"] } } }',
      'a/lib/y.ts': '',
      'b/y.ts': '',
      'c/x.ts': '',
    });
    expect(r('@/lib/y', 'src/i.ts')).toBe('b/y.ts');
    expect(r('@/lib/x', 'src/i.ts')).toBe('c/x.ts');
  });
  it('falls through to a workspace package when a matched pattern names no file', () => {
    const r = project({
      'tsconfig.json': '{ "compilerOptions": { "paths": { "@acme/*": ["./missing/*"] } } }',
      'packages/b/package.json': '{ "name": "@acme/b", "main": "./index.ts" }',
      'packages/b/index.ts': '',
    });
    expect(r('@acme/b', 'src/i.ts')).toBe('packages/b/index.ts');
  });
  it('uses jsconfig.json for a JavaScript importer, never for a TypeScript one', () => {
    const r = project({ 'jsconfig.json': '{ "compilerOptions": { "baseUrl": "." } }', 'lib/x.js': '' });
    expect(r('lib/x', 'src/a.js')).toBe('lib/x.js');
    expect(r('lib/x', 'src/a.ts')).toBeUndefined();
  });
});

describe('resolveTsPath — packages', () => {
  it('never indexes a package.json under node_modules (the workspace symlink) or a dot-directory', () => {
    const r = project({
      'packages/b/package.json': '{ "name": "@acme/b", "main": "./index.ts" }',
      'packages/b/index.ts': '',
      'node_modules/@acme/b/package.json': '{ "name": "@acme/b", "main": "./index.ts" }',
      'node_modules/@acme/b/index.ts': '',
      '.cache/b/package.json': '{ "name": "@acme/b" }',
    });
    expect(r('@acme/b', 'packages/a/use.ts')).toBe('packages/b/index.ts');
  });
  it('honours exports as the whole public surface: an unlisted or null-blocked subpath is silent', () => {
    const r = project({
      'packages/b/package.json': '{ "name": "b", "exports": { ".": "./index.ts", "./internal/*": null, "./*": "./src/*.ts" } }',
      'packages/b/index.ts': '',
      'packages/b/src/feat.ts': '',
      'packages/b/internal/x.ts': '',
      'packages/b/hidden.ts': '',
    });
    expect(r('b', 'a/u.ts')).toBe('packages/b/index.ts');
    expect(r('b/feat', 'a/u.ts')).toBe('packages/b/src/feat.ts');
    expect(r('b/internal/x', 'a/u.ts')).toBeUndefined();
  });
  it('reads the exports shorthands (string, conditions object)', () => {
    const s = project({ 'p/package.json': '{ "name": "s", "exports": "./main.ts" }', 'p/main.ts': '' });
    expect(s('s', 'a/u.ts')).toBe('p/main.ts');
    const c = project({ 'p/package.json': '{ "name": "c", "exports": { "import": "./dist/m.js", "default": "./m.ts" } }', 'p/m.ts': '' });
    expect(c('c', 'a/u.ts')).toBe('p/m.ts');
  });
  it('resolves a subpath of a package without exports inside the package, and the root through main then index', () => {
    const r = project({ 'p/package.json': '{ "name": "p" }', 'p/index.ts': '', 'p/util/x.ts': '' });
    expect(r('p', 'a/u.ts')).toBe('p/index.ts');
    expect(r('p/util/x', 'a/u.ts')).toBe('p/util/x.ts');
  });
  it('a `#` import with a bare target resolves that target as a package', () => {
    const r = project({
      'package.json': '{ "name": "app", "imports": { "#dep": "@acme/b" } }',
      'packages/b/package.json': '{ "name": "@acme/b", "main": "./index.ts" }',
      'packages/b/index.ts': '',
    });
    expect(r('#dep', 'src/a.ts')).toBe('packages/b/index.ts');
  });
  it('root-absolute resolves from the package root and is silent without one', () => {
    const r = project({ 'web/package.json': '{}', 'web/src/x.ts': '', 'src/x.ts': '' });
    expect(r('/src/x', 'web/src/pages/a.ts')).toBe('web/src/x.ts');
    const none = project({ 'src/x.ts': '' });
    expect(none('/src/x', 'src/a.ts')).toBeUndefined();
  });
  it('strips a query suffix and probes an explicit non-source extension literally', () => {
    const r = project({ 'src/icon.svg': '<svg/>', 'src/data.json': '{}' });
    expect(r('./icon.svg?raw', 'src/a.ts')).toBe('src/icon.svg');
    expect(r('./data.json', 'src/a.ts')).toBe('src/data.json');
  });
  it('never reads a package.json above the repository root', () => {
    const r = project({ 'a.ts': '' });
    expect(r('../outside', 'a.ts')).toBeUndefined();
  });
});

// Issue 011: a solution-style tsconfig.json (`files: []` plus `references`) gives a file the options of the referenced config that includes it; a Vue or Svelte component reads jsconfig.json as a JavaScript file does.
describe('resolveTsPath — solution-style tsconfig references', () => {
  const app = (paths, extra = {}) => JSON.stringify({ include: ['env.d.ts', 'src/**/*', 'src/**/*.vue'], exclude: ['src/**/__tests__/*'], ...extra, compilerOptions: { paths } });
  it('takes paths from the referenced config whose include holds the file, and honours its exclude', () => {
    const r = project({
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.app.json" }, { "path": "./tsconfig.vitest.json" }] }',
      'tsconfig.node.json': '{ "include": ["vite.config.*"], "compilerOptions": { "paths": { "@/*": ["./build/*"] } } }',
      'tsconfig.app.json': app({ '@/*': ['./src/*'] }),
      'tsconfig.vitest.json': '{ "extends": "./tsconfig.app.json", "include": ["src/**/__tests__/*"], "exclude": [], "compilerOptions": { "paths": { "@/*": ["./fixtures/*"] } } }',
      'src/m.ts': '',
      'build/m.ts': '',
      'fixtures/m.ts': '',
    });
    expect(r('@/m', 'src/views/Home.ts')).toBe('src/m.ts');
    expect(r('@/m', 'src/cart/Cart.vue')).toBe('src/m.ts');
    expect(r('@/m', 'env.d.ts')).toBe('src/m.ts');
    expect(r('@/m', 'vite.config.ts')).toBe('build/m.ts');
    expect(r('@/m', 'src/cart/__tests__/cart.spec.ts')).toBe('fixtures/m.ts');
  });
  it('several referenced configs that include the file agree, or the file is silent', () => {
    const files = (bPaths) => ({
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./a.json" }, { "path": "./b.json" }] }',
      'a.json': JSON.stringify({ include: ['src'], compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
      'b.json': JSON.stringify({ files: ['src/x.ts'], compilerOptions: { paths: bPaths } }),
      'src/m.ts': '',
      'lib/m.ts': '',
    });
    expect(project(files({ '@/*': ['./src/*'] }))('@/m', 'src/x.ts')).toBe('src/m.ts');
    expect(project(files({ '@/*': ['./lib/*'] }))('@/m', 'src/x.ts')).toBeUndefined();
    // A file only one of them includes takes that one's paths.
    expect(project(files({ '@/*': ['./lib/*'] }))('@/m', 'src/y.ts')).toBe('src/m.ts');
  });
  it('follows a reference to a directory and nested solution configs, and skips a reference that is not there', () => {
    const r = project({
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./missing.json" }, { "path": "./cfg" }, { "path": "./tsconfig.json" }, "bad", { "path": 1 }] }',
      'cfg/tsconfig.json': '{ "files": [], "references": [{ "path": "./web.json" }, { "path": "../tsconfig.json" }] }',
      'cfg/web.json': '{ "include": ["../web"], "compilerOptions": { "baseUrl": "../web/src" } }',
      'web/src/lib/x.ts': '',
    });
    expect(r('lib/x', 'web/src/main.ts')).toBe('web/src/lib/x.ts');
  });
  it('a file no referenced config includes keeps the nearest config, and a config that includes the file ignores its references', () => {
    const r = project({
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }], "compilerOptions": { "baseUrl": "." } }',
      'tsconfig.app.json': app({ '@/*': ['./src/*'] }),
      'lib/x.ts': '',
      'src/m.ts': '',
    });
    expect(r('lib/x', 'scripts/build.ts')).toBe('lib/x.ts');
    expect(r('@/m', 'scripts/build.ts')).toBeUndefined();
    const own = project({
      'tsconfig.json': '{ "references": [{ "path": "./other.json" }], "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
      'other.json': '{ "include": ["src/**/*"], "compilerOptions": { "paths": { "@/*": ["./lib/*"] } } }',
      'src/m.ts': '',
      'lib/m.ts': '',
    });
    expect(own('@/m', 'src/a.ts')).toBe('src/m.ts');
  });
  it('a referenced config that cannot be read silences the file, which it may include', () => {
    const r = project({
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./broken.json" }] }',
      'tsconfig.app.json': app({ '@/*': ['./src/*'] }),
      'broken.json': '{ "include": [',
      'src/m.ts': '',
    });
    expect(r('@/m', 'src/a.ts')).toBeUndefined();
  });
  // Issue 155 (4): a referenced config whose extends chain cannot be read (a generated SvelteKit or Nuxt base absent from the commit) keeps its options unknowable, but tsc still reads it without that base, so it may hold only what lies under its own directory and what its readable configs name; a file outside both is not silenced by it.
  describe('a referenced config whose extends chain cannot be read (issue 155, 4)', () => {
    const monorepo = {
      'package.json': '{ "private": true, "workspaces": ["apps/*", "packages/*"] }',
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./packages/core" }, { "path": "./apps/web/tsconfig.app.json" }] }',
      'packages/core/package.json': '{ "name": "@acme/core", "main": "./src/index.ts" }',
      'packages/core/tsconfig.json': '{ "include": ["src"] }',
      'packages/core/src/index.ts': '',
      'apps/web/package.json': '{ "name": "web" }',
      'apps/web/tsconfig.app.json': '{ "extends": "./.svelte-kit/tsconfig.json" }',
    };
    it('a file outside its directory that no readable referenced config holds takes the nearest config\'s options', () => {
      const r = project(monorepo);
      expect(r('@acme/core', 'scripts/release.ts')).toBe('packages/core/src/index.ts');
      expect(r('@acme/core', 'eslint.config.js')).toBe('packages/core/src/index.ts');
      // The generated base on disk but excluded (git-ignored) reads the same.
      const generated = project({ ...monorepo, 'apps/web/.svelte-kit/tsconfig.json': '{ "include": ["../../../scripts/**/*.ts"] }' }, (p) => p.includes('/.svelte-kit/'));
      expect(generated('@acme/core', 'scripts/release.ts')).toBe('packages/core/src/index.ts');
    });
    it('a file under its directory stays silent: the base it cannot read may remap the import', () => {
      expect(project(monorepo)('@acme/core', 'apps/web/src/routes/page.ts')).toBeUndefined();
    });
    it('a file its own include, or the include or files of a base it can read, names stays silent outside its directory too', () => {
      const r = project({
        ...monorepo,
        'apps/web/tsconfig.app.json': '{ "extends": ["./base.json", "./.svelte-kit/tsconfig.json", "@acme/uninstalled-preset"], "include": ["src", "../../tools/**/*"] }',
        'apps/web/base.json': '{ "extends": "./base2.json", "files": ["../../scripts/one.ts"] }',
        'apps/web/base2.json': '{ "include": ["../../e2e"] }',
      });
      expect(r('@acme/core', 'tools/gen.ts')).toBeUndefined();
      expect(r('@acme/core', 'scripts/one.ts')).toBeUndefined();
      expect(r('@acme/core', 'e2e/smoke.ts')).toBeUndefined();
      expect(r('@acme/core', 'scripts/two.ts')).toBe('packages/core/src/index.ts');
    });
    it('a base that does not parse names nothing, and an extends cycle ends', () => {
      const r = project({
        ...monorepo,
        'apps/web/tsconfig.app.json': '{ "extends": ["./broken.json", "./cycle.json", 7] }',
        'apps/web/broken.json': '{ "include": [',
        'apps/web/cycle.json': '{ "extends": "./tsconfig.app.json" }',
      });
      expect(r('@acme/core', 'scripts/release.ts')).toBe('packages/core/src/index.ts');
      expect(r('@acme/core', 'apps/web/src/a.ts')).toBeUndefined();
    });
    it('a referenced config that does not parse may hold anything, and the references of one that parses are still searched', () => {
      const broken = project({ ...monorepo, 'apps/web/tsconfig.app.json': '{ "extends": ' });
      expect(broken('@acme/core', 'scripts/release.ts')).toBeUndefined();
      const r = project({
        ...monorepo,
        'apps/web/tsconfig.app.json': '{ "extends": "./.svelte-kit/tsconfig.json", "references": [{ "path": "../../tools" }] }',
        'tools/tsconfig.json': '{ "include": ["../scripts"], "compilerOptions": { "paths": { "@acme/core": ["./core-stub.ts"] } } }',
        'tools/core-stub.ts': '',
      });
      expect(r('@acme/core', 'scripts/release.ts')).toBe('tools/core-stub.ts');
    });
  });
  // A config with neither `files` nor `include` holds everything under its directory, also when the directory name has a dot (`apps/web.v2`), as tsc reads it.
  describe('a config without files or include holds its whole directory, dotted or not', () => {
    it('a nearest config that holds the file by default keeps its own paths over a referenced one', () => {
      const r = project({
        'apps/web.v2/tsconfig.json': '{ "references": [{ "path": "./tsconfig.node.json" }], "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
        'apps/web.v2/tsconfig.node.json': '{ "include": ["**/*.ts"], "compilerOptions": { "paths": { "@/*": ["./build/*"] } } }',
        'apps/web.v2/src/m.ts': '',
        'apps/web.v2/build/m.ts': '',
      });
      expect(r('@/m', 'apps/web.v2/src/a.ts')).toBe('apps/web.v2/src/m.ts');
    });
    it('a referenced config holding the file by default and another holding it by include disagree, so the file is silent', () => {
      const r = project({
        'apps/web.v2/tsconfig.json': '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.lint.json" }] }',
        'apps/web.v2/tsconfig.app.json': '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
        'apps/web.v2/tsconfig.lint.json': '{ "include": ["src/**/*.ts"], "compilerOptions": { "paths": { "@/*": ["./lint/*"] } } }',
        'apps/web.v2/src/m.ts': '',
        'apps/web.v2/lint/m.ts': '',
      });
      expect(r('@/m', 'apps/web.v2/src/a.ts')).toBeUndefined();
    });
    it('the only referenced config, holding the file by default, gives its paths', () => {
      const r = project({
        'apps/web.v2/tsconfig.json': '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }',
        'apps/web.v2/tsconfig.app.json': '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
        'apps/web.v2/src/m.ts': '',
      });
      expect(r('@/m', 'apps/web.v2/src/a.ts')).toBe('apps/web.v2/src/m.ts');
    });
  });
  // Issue 155 (5): a referenced config holds a file as tsc's own matcher decides (checked with tsc --listFilesOnly). The solution root maps @/* to root/, so a file no referenced config holds shows the root's own paths.
  describe('a referenced config holds a file as tsc decides (issue 155, 5)', () => {
    const solution = (configs, files = {}) => {
      const r = project({
        'tsconfig.json': JSON.stringify({ files: [], references: Object.keys(configs).map((c) => ({ path: `./${c}` })), compilerOptions: { paths: { '@/*': ['./root/*'] } } }),
        'root/m.ts': '',
        ...Object.fromEntries(Object.entries(configs).map(([c, json], i) => [c, JSON.stringify({ ...json, compilerOptions: { ...json.compilerOptions, paths: { '@/*': [`${'../'.repeat(c.split('/').length - 1)}T${i}/*`] } } })])),
        ...Object.fromEntries(Object.keys(configs).map((_, i) => [`T${i}/m.ts`, ''])),
        ...files,
      });
      return (from) => r('@/m', from);
    };
    it('a wildcard that opens a segment, and every segment ** spans, skips a name starting with a dot; a dot name spelled out matches', () => {
      const r = solution({ 'app.json': { include: ['src/**/*', 'lib/?x/*.ts', 'lib/*y/*.ts'] }, 'gen.json': { include: ['src/.gen/**/*'] } });
      expect(r('src/b.ts')).toBe('T0/m.ts');
      expect(r('src/.a.ts')).toBe('root/m.ts');
      expect(r('src/x/.c.ts')).toBe('root/m.ts');
      expect(r('lib/ax/a.ts')).toBe('T0/m.ts');
      expect(r('lib/.x/a.ts')).toBe('root/m.ts');
      expect(r('lib/.y/a.ts')).toBe('root/m.ts');
      // Only the config that names the dot directory holds it, so its paths apply instead of a disagreement.
      expect(r('src/.gen/a.ts')).toBe('T1/m.ts');
      expect(r('src/.gen/.h/b.ts')).toBe('root/m.ts');
    });
    it('a wildcard never matches node_modules, bower_components or jspm_packages; a literal segment does', () => {
      const r = solution({ 'app.json': { include: ['src/**/*', 'lib/*/x.ts', 'vendor/node_modules/**/*'] } });
      for (const f of ['src/node_modules/a.ts', 'src/bower_components/b.ts', 'src/jspm_packages/c.ts', 'lib/node_modules/x.ts']) expect(r(f)).toBe('root/m.ts');
      expect(r('src/node_modules_x/d.ts')).toBe('T0/m.ts');
      expect(r('vendor/node_modules/y/a.ts')).toBe('T0/m.ts');
    });
    it('a * in the last segment never spans the dot of a trailing .min.js', () => {
      const r = solution({ 'app.json': { include: ['src/*.js', 'src/**/*.ts'] } });
      expect(r('src/a.min.js')).toBe('root/m.ts');
      expect(r('src/a.js')).toBe('T0/m.ts');
      expect(r('src/b.min.ts')).toBe('T0/m.ts');
    });
    it('an include ending in ** and an include or exclude with .. after ** are rejected, so they match nothing', () => {
      const r = solution({ 'app.json': { include: ['src/**', 'lib/**/', 'up/**/../lib/*.ts', 'keep/*.ts'], exclude: ['keep/**/..'] } });
      for (const f of ['src/a.ts', 'src/x/b.ts', 'lib/c.ts', 'up/lib/a.ts']) expect(r(f)).toBe('root/m.ts');
      expect(r('keep/a.ts')).toBe('T0/m.ts');
    });
    it('without an exclude anywhere in the chain, outDir and declarationDir are excluded, each from the config that sets it', () => {
      const r = solution({
        'a.json': { include: ['a/**/*'], compilerOptions: { outDir: 'a/out', declarationDir: 'a/types' } },
        'cfg/b.json': { extends: './base.json', include: ['../pkg/**/*'] },
        'app/c.json': { extends: '../shared.json', include: ['./**/*'] },
        'd.json': { include: ['d/**/*'], exclude: ['nothing'], compilerOptions: { outDir: 'd/out' } },
        'e.json': { extends: './e-base.json', include: ['e/**/*'], compilerOptions: { outDir: 'e/out' } },
        'f.json': { include: ['f/**/*'], compilerOptions: { outDir: '../../../outside' } },
      }, {
        'cfg/base.json': JSON.stringify({ compilerOptions: { outDir: '../pkg/out' } }),
        'shared.json': JSON.stringify({ compilerOptions: { outDir: '${configDir}/dist' } }),
        'e-base.json': JSON.stringify({ exclude: ['e/legacy'] }),
      });
      expect(r('a/out/a.ts')).toBe('root/m.ts');
      expect(r('a/types/b.ts')).toBe('root/m.ts');
      expect(r('a/src/a.ts')).toBe('T0/m.ts');
      expect(r('pkg/out/a.ts')).toBe('root/m.ts');
      expect(r('pkg/src/a.ts')).toBe('T1/m.ts');
      expect(r('app/dist/a.ts')).toBe('root/m.ts');
      expect(r('app/src/a.ts')).toBe('T2/m.ts');
      // An exclude set anywhere in the chain replaces the default.
      expect(r('d/out/a.ts')).toBe('T3/m.ts');
      expect(r('e/out/a.ts')).toBe('T4/m.ts');
      expect(r('e/legacy/a.ts')).toBe('root/m.ts');
      // An outDir outside the repository excludes nothing in it.
      expect(r('f/a.ts')).toBe('T5/m.ts');
    });
    it('an outDir that is the config directory itself excludes everything the config would hold', () => {
      const r = solution({ 'web/app.json': { compilerOptions: { outDir: '.' } }, 'top.json': { include: ['top/**/*'], compilerOptions: { outDir: '.' } } });
      expect(r('web/src/a.ts')).toBe('root/m.ts');
      expect(r('top/a.ts')).toBe('root/m.ts');
    });
  });
  it('excludes a directory named in exclude, and reads include and files inherited through extends', () => {
    const r = project({
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./cfg/app.json" }, { "path": "./legacy.json" }] }',
      'cfg/base.json': '{ "include": ["../src"], "exclude": ["../src/legacy"] }',
      'cfg/app.json': '{ "extends": "./base.json", "compilerOptions": { "paths": { "@/*": ["../src/*"] } } }',
      'legacy.json': '{ "include": ["src/legacy/**/*.ts", "src/legacy/one?.ts"], "exclude": "nope", "compilerOptions": { "paths": { "@/*": ["./old/*"] } } }',
      'src/m.ts': '',
      'old/m.ts': '',
    });
    expect(r('@/m', 'src/a/b.ts')).toBe('src/m.ts');
    expect(r('@/m', 'src/legacy/deep/c.ts')).toBe('old/m.ts');
  });
});

describe('resolveTsPath — a Vue or Svelte component reads jsconfig.json', () => {
  it('reads jsconfig.json for a .vue or .svelte importer, as for a JavaScript file', () => {
    const r = project({ 'jsconfig.json': '{ "compilerOptions": { "baseUrl": "." } }', 'lib/x.js': '' });
    expect(r('lib/x', 'src/Counter.vue')).toBe('lib/x.js');
    expect(r('lib/x', 'src/Widget.svelte')).toBe('lib/x.js');
    expect(r('lib/x', 'src/a.ts')).toBeUndefined();
  });
});

// Issue 012: inside a declared workspace a bare name binds only to a workspace member, or to the package the importer's own package.json declares under that name with a local spec; a repository that declares no workspace keeps indexing every package.json.
describe('resolveTsPath — workspace membership', () => {
  it('a fixture outside the workspace globs is not importable by name; a member is (scenario B)', () => {
    const r = project({
      'package.json': '{ "private": true, "workspaces": ["packages/*"] }',
      'packages/resolver/package.json': '{ "name": "@acme/resolver", "main": "./index.ts" }',
      'packages/resolver/index.ts': '',
      'packages/resolver/test/fixtures/lodash/package.json': '{ "name": "lodash", "main": "./index.js" }',
      'packages/resolver/test/fixtures/lodash/index.js': '',
    });
    expect(r('lodash', 'packages/app/src/index.ts')).toBeUndefined();
    expect(r('@acme/resolver', 'packages/app/src/index.ts')).toBe('packages/resolver/index.ts');
    // A file of the workspace that belongs to no member (an e2e test) sees the members too, as Node does through the root node_modules.
    expect(r('@acme/resolver', 'e2e/run.ts')).toBe('packages/resolver/index.ts');
    expect(r('lodash', 'e2e/run.ts')).toBeUndefined();
  });
  it('without any workspace declaration every package.json still counts, as before', () => {
    const r = project({
      'packages/resolver/test/fixtures/lodash/package.json': '{ "name": "lodash", "main": "./index.js" }',
      'packages/resolver/test/fixtures/lodash/index.js': '',
    });
    expect(r('lodash', 'packages/app/src/index.ts')).toBe('packages/resolver/test/fixtures/lodash/index.js');
  });
  it('two members with one name are ambiguous; a fixture copying a member name is not (scenario D1)', () => {
    const files = {
      'package.json': '{ "workspaces": { "packages": ["packages/*", "tools/*"] } }',
      'packages/core/package.json': '{ "name": "@acme/core", "main": "./index.ts" }',
      'packages/core/index.ts': '',
      'fixtures/core/package.json': '{ "name": "@acme/core", "main": "./index.ts" }',
      'fixtures/core/index.ts': '',
    };
    expect(project(files)('@acme/core', 'packages/app/a.ts')).toBe('packages/core/index.ts');
    const twice = project({ ...files, 'tools/core/package.json': '{ "name": "@acme/core" }', 'tools/core/index.ts': '' });
    expect(twice('@acme/core', 'packages/app/a.ts')).toBeUndefined();
  });
  it('reads pnpm-workspace.yaml, with ** globs and ! negation', () => {
    const r = project({
      'pnpm-workspace.yaml': "# the workspace\npackages:\n  - 'apps/**'\n  - \"libs/*\" # libraries\n  - '!**/test/**'\ncatalog:\n  react: ^18\n",
      'apps/web/package.json': '{ "name": "web", "main": "./index.ts" }',
      'apps/web/index.ts': '',
      'apps/group/admin/package.json': '{ "name": "admin", "main": "./index.ts" }',
      'apps/group/admin/index.ts': '',
      'libs/ui/package.json': '{ "name": "ui", "main": "./index.ts" }',
      'libs/ui/index.ts': '',
      'libs/ui/nested/package.json': '{ "name": "nested", "main": "./index.ts" }',
      'libs/ui/nested/index.ts': '',
      'apps/web/test/mock/package.json': '{ "name": "mock", "main": "./index.ts" }',
      'apps/web/test/mock/index.ts': '',
    });
    expect(r('web', 'libs/ui/a.ts')).toBe('apps/web/index.ts');
    expect(r('admin', 'libs/ui/a.ts')).toBe('apps/group/admin/index.ts');
    expect(r('ui', 'apps/web/a.ts')).toBe('libs/ui/index.ts');
    expect(r('nested', 'apps/web/a.ts')).toBeUndefined();
    expect(r('mock', 'apps/web/a.ts')).toBeUndefined();
  });
  it('expands brace globs in a workspace declaration, nested ones and negated ones too', () => {
    const pkg = (name) => ({ [`${name}/package.json`]: JSON.stringify({ name: path.posix.basename(name), main: './index.ts' }), [`${name}/index.ts`]: '' });
    const r = project({
      'package.json': '{ "workspaces": ["packages/{core,ui}", "apps/{web,{admin,docs}}", "tools/*", "!tools/{x,y}", "odd/{unclosed", "lit/{one}x{a,b}"] }',
      ...pkg('packages/core'), ...pkg('packages/ui'), ...pkg('packages/other'),
      ...pkg('apps/web'), ...pkg('apps/admin'), ...pkg('apps/docs'), ...pkg('apps/blog'),
      ...pkg('tools/x'), ...pkg('tools/z'),
      ...pkg('odd/{unclosed'), ...pkg('lit/{one}xb'),
    });
    for (const dir of ['packages/core', 'packages/ui', 'apps/web', 'apps/admin', 'apps/docs', 'tools/z', 'odd/{unclosed', 'lit/{one}xb']) expect(r(path.posix.basename(dir), 'src/main.ts')).toBe(`${dir}/index.ts`);
    for (const outside of ['other', 'blog', 'x']) expect(r(outside, 'src/main.ts')).toBeUndefined();
  });
  it('reads a pnpm-workspace.yaml flow list; one with no packages list (catalog settings only) counts every package under it, as an undeclared repository does', () => {
    const flow = project({
      'pnpm-workspace.yaml': "packages: ['pkgs/?', \"!pkgs/x\"]\n",
      'pkgs/a/package.json': '{ "name": "a", "main": "./index.ts" }',
      'pkgs/a/index.ts': '',
      'pkgs/x/package.json': '{ "name": "x", "main": "./index.ts" }',
      'pkgs/x/index.ts': '',
      'pkgs/long/package.json': '{ "name": "long", "main": "./index.ts" }',
      'pkgs/long/index.ts': '',
    });
    expect(flow('a', 'src/m.ts')).toBe('pkgs/a/index.ts');
    expect(flow('x', 'src/m.ts')).toBeUndefined();
    expect(flow('long', 'src/m.ts')).toBeUndefined();
    const multiline = project({
      'pnpm-workspace.yaml': "packages: [\n  './apps/web.v2/',\n  'tools/*'\n]\n",
      'apps/web.v2/package.json': '{ "name": "web2", "main": "./index.ts" }',
      'apps/web.v2/index.ts': '',
      'apps/webXv2/package.json': '{ "name": "webx", "main": "./index.ts" }',
      'apps/webXv2/index.ts': '',
    });
    expect(multiline('web2', 'src/m.ts')).toBe('apps/web.v2/index.ts');
    expect(multiline('webx', 'src/m.ts')).toBeUndefined();
    const all = project({
      'pnpm-workspace.yaml': 'catalog:\n  react: ^18\n',
      'deep/er/p/package.json': '{ "name": "p", "main": "./index.ts" }',
      'deep/er/p/index.ts': '',
    });
    expect(all('p', 'src/m.ts')).toBe('deep/er/p/index.ts');
  });
  it('the root package is a member, and the nearest declaration above the importer is the workspace', () => {
    const r = project({
      'package.json': '{ "name": "root-pkg", "main": "./root.ts", "workspaces": ["packages/*", "e2e/demo"] }',
      'root.ts': '',
      'packages/a/package.json': '{ "name": "a", "main": "./index.ts" }',
      'packages/a/index.ts': '',
      'e2e/demo/package.json': '{ "name": "demo", "workspaces": ["libs/*"] }',
      'e2e/demo/libs/inner/package.json': '{ "name": "inner", "main": "./index.ts" }',
      'e2e/demo/libs/inner/index.ts': '',
    });
    expect(r('root-pkg', 'packages/a/x.ts')).toBe('root.ts');
    expect(r('inner', 'e2e/demo/src/x.ts')).toBe('e2e/demo/libs/inner/index.ts');
    expect(r('inner', 'packages/a/x.ts')).toBeUndefined();
  });
  // Issue 155 (1): npm and pnpm install a member's directory from the enclosing root and ignore its own declaration, and yarn links nested worktrees into one project, so a member that declares a workspace of its own still sees the enclosing members.
  describe('a member that declares its own workspace (issue 155, 1)', () => {
    const nested = {
      'package.json': '{ "name": "root-pkg", "workspaces": ["packages/*", "e2e/demo"] }',
      'packages/a/package.json': '{ "name": "a", "main": "./index.ts" }',
      'packages/a/index.ts': '',
      'e2e/demo/package.json': '{ "name": "demo", "workspaces": ["libs/*"] }',
      'e2e/demo/libs/inner/package.json': '{ "name": "inner", "main": "./index.ts" }',
      'e2e/demo/libs/inner/index.ts': '',
    };
    it('sees the enclosing members, from its own files and from its own members', () => {
      const r = project(nested);
      expect(r('a', 'e2e/demo/src/x.ts')).toBe('packages/a/index.ts');
      expect(r('a', 'e2e/demo/libs/inner/y.ts')).toBe('packages/a/index.ts');
      expect(r('inner', 'e2e/demo/src/x.ts')).toBe('e2e/demo/libs/inner/index.ts');
    });
    it('reads a pnpm-workspace.yaml nested in a member the same way', () => {
      const r = project({
        'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n  - 'e2e/demo'\n",
        'packages/a/package.json': '{ "name": "a", "main": "./index.ts" }',
        'packages/a/index.ts': '',
        'e2e/demo/package.json': '{ "name": "demo", "dependencies": { "a": "workspace:*" } }',
        'e2e/demo/pnpm-workspace.yaml': "packages:\n  - 'libs/*'\n",
      });
      expect(r('a', 'e2e/demo/src/x.ts')).toBe('packages/a/index.ts');
    });
    it('a name the nested and the enclosing workspace bind to different packages is ambiguous (npm takes the enclosing one, yarn refuses the pair)', () => {
      const r = project({ ...nested, 'e2e/demo/libs/a/package.json': '{ "name": "a", "main": "./index.ts" }', 'e2e/demo/libs/a/index.ts': '' });
      expect(r('a', 'e2e/demo/src/x.ts')).toBeUndefined();
      expect(r('a', 'packages/a/x.ts')).toBe('packages/a/index.ts');
    });
    it('a nested project the enclosing globs do not match is installed on its own: the enclosing members stay silent there', () => {
      // Node would still find them through the enclosing root's node_modules, unless the nested project's own install holds a registry package of the same name; which it holds is not known here.
      const r = project({
        'package.json': '{ "workspaces": ["packages/*"] }',
        'packages/a/package.json': '{ "name": "a", "main": "./index.ts" }',
        'packages/a/index.ts': '',
        'examples/demo/package.json': '{ "name": "demo", "private": true, "workspaces": ["libs/*"] }',
        'examples/demo/libs/inner/package.json': '{ "name": "inner", "main": "./index.ts" }',
        'examples/demo/libs/inner/index.ts': '',
      });
      expect(r('a', 'examples/demo/src/x.ts')).toBeUndefined();
      expect(r('inner', 'examples/demo/src/x.ts')).toBe('examples/demo/libs/inner/index.ts');
      expect(r('inner', 'packages/a/x.ts')).toBeUndefined();
    });
  });
  // Issue 155 (2): Node and TypeScript resolve a package's own name from inside it through its `exports` (self-reference), before any node_modules lookup, wherever the package sits.
  it('a package with exports imports itself by name, inside the globs or not; without exports, or under a marker package.json, it does not (issue 155, 2)', () => {
    const r = project({
      'package.json': '{ "workspaces": ["packages/*"] }',
      'packages/a/package.json': '{ "name": "a", "main": "./index.ts" }',
      'packages/a/index.ts': '',
      'tools/gen/package.json': '{ "name": "gen", "exports": { ".": "./index.ts", "./sub": "./lib/sub.ts" } }',
      'tools/gen/index.ts': '',
      'tools/gen/lib/sub.ts': '',
      'tools/gen/lib/hidden.ts': '',
      'tools/gen/src/esm/package.json': '{ "type": "module" }',
      'tools/plain/package.json': '{ "name": "plain", "main": "./index.ts" }',
      'tools/plain/index.ts': '',
      'fixtures/gen/package.json': '{ "name": "gen", "main": "./index.ts" }',
      'fixtures/gen/index.ts': '',
    });
    expect(r('gen', 'tools/gen/src/x.ts')).toBe('tools/gen/index.ts');
    expect(r('gen/sub', 'tools/gen/src/x.ts')).toBe('tools/gen/lib/sub.ts');
    // `exports` is the whole public surface, for the package itself too.
    expect(r('gen/lib/hidden', 'tools/gen/src/x.ts')).toBeUndefined();
    // The package scope is the nearest package.json: a marker without the name or `exports` ends self-reference, as in Node.
    expect(r('gen', 'tools/gen/src/esm/x.ts')).toBeUndefined();
    expect(r('plain', 'tools/plain/src/x.ts')).toBeUndefined();
    // Elsewhere the name is not linked: neither the package nor the fixture copying its name.
    expect(r('gen', 'packages/a/x.ts')).toBeUndefined();
    // Without any workspace declaration, the package's own name still beats a fixture copying it.
    const undeclared = project({
      'tools/gen/package.json': '{ "name": "gen", "exports": "./index.ts" }',
      'tools/gen/index.ts': '',
      'fixtures/gen/package.json': '{ "name": "gen", "main": "./index.ts" }',
      'fixtures/gen/index.ts': '',
    });
    expect(undeclared('gen', 'tools/gen/src/x.ts')).toBe('tools/gen/index.ts');
    expect(undeclared('gen', 'src/x.ts')).toBeUndefined();
  });
  // Issue 155 (3): a package.json that names no package and declares no dependencies (a `{"type": "module"}` marker) installs nothing, so the files under it see the dependencies of the package around it.
  it('a file under a marker package.json sees the local dependencies of the package around it (issue 155, 3)', () => {
    const r = project({
      'package.json': '{ "workspaces": ["packages/*"] }',
      'packages/app/package.json': '{ "name": "app", "dependencies": { "vend": "file:../../vendor/vend" } }',
      'packages/app/src/esm/package.json': '{ "type": "commonjs" }',
      'packages/app/src/esm/deep/package.json': '{ "type": "module", "sideEffects": false }',
      'packages/app/src/nested/package.json': '{ "workspaces": ["libs/*"] }',
      'packages/app/src/named/package.json': '{ "name": "named-sub" }',
      'vendor/vend/package.json': '{ "name": "vend", "main": "./index.ts" }',
      'vendor/vend/index.ts': '',
    });
    expect(r('vend', 'packages/app/src/y.ts')).toBe('vendor/vend/index.ts');
    expect(r('vend', 'packages/app/src/esm/x.ts')).toBe('vendor/vend/index.ts');
    expect(r('vend', 'packages/app/src/esm/deep/z.ts')).toBe('vendor/vend/index.ts');
    // A package.json that names a package or declares a workspace is a package of its own, with its own dependencies.
    expect(r('vend', 'packages/app/src/named/x.ts')).toBeUndefined();
    expect(r('vend', 'packages/app/src/nested/x.ts')).toBeUndefined();
  });
  it('a malformed workspaces field is not a declaration', () => {
    const r = project({
      'package.json': '{ "workspaces": "packages/*" }',
      'fixtures/f/package.json': '{ "name": "f", "main": "./index.ts" }',
      'fixtures/f/index.ts': '',
    });
    expect(r('f', 'src/a.ts')).toBe('fixtures/f/index.ts');
  });
  it('a package the importer declares with a file:, link: or portal: spec binds under the dependency name', () => {
    const r = project({
      'package.json': '{ "workspaces": ["packages/*"] }',
      'packages/app/package.json': JSON.stringify({
        name: 'app',
        dependencies: { 'local-a': 'file:../../vendor/a', 'tarball': 'file:../../vendor/a.tgz', 'far': 'file:../../../elsewhere' },
        devDependencies: { 'local-b': 'link:./tools/b' },
        optionalDependencies: { 'local-c': 'portal:../../vendor/c' },
        peerDependencies: { registry: '^1.0.0' },
      }),
      'vendor/a/package.json': '{ "name": "a-real-name", "main": "./index.ts" }',
      'vendor/a/index.ts': '',
      'vendor/a.tgz': '',
      'packages/app/tools/b/package.json': '{ "name": "b" }',
      'packages/app/tools/b/index.ts': '',
      'vendor/c/package.json': '{ "name": "c", "main": "./index.ts" }',
      'vendor/c/index.ts': '',
      'vendor/registry/package.json': '{ "name": "registry", "main": "./index.ts" }',
      'vendor/registry/index.ts': '',
    });
    expect(r('local-a', 'packages/app/src/x.ts')).toBe('vendor/a/index.ts');
    expect(r('local-b', 'packages/app/src/x.ts')).toBe('packages/app/tools/b/index.ts');
    expect(r('local-c', 'packages/app/src/x.ts')).toBe('vendor/c/index.ts');
    // A local spec that names no in-repo package (a tarball, a path outside the repository) is silent.
    expect(r('tarball', 'packages/app/src/x.ts')).toBeUndefined();
    expect(r('far', 'packages/app/src/x.ts')).toBeUndefined();
    // A registry range is the installed dependency; the in-repo copy outside the globs is not it.
    expect(r('registry', 'packages/app/src/x.ts')).toBeUndefined();
    // Only the importer's own package.json counts.
    expect(r('local-a', 'packages/other/x.ts')).toBeUndefined();
  });
  it('the workspace: protocol binds a member by the dependency name, an alias, or a relative path', () => {
    const r = project({
      'package.json': '{ "workspaces": ["packages/*"] }',
      'packages/app/package.json': JSON.stringify({
        name: 'app',
        dependencies: { core: 'workspace:*', 'ui-alias': 'workspace:@acme/ui@^1.0.0', plain: 'workspace:plain-lib@*', near: 'workspace:../near', missing: 'workspace:nope@*' },
      }),
      'packages/core/package.json': '{ "name": "core", "main": "./index.ts" }',
      'packages/core/index.ts': '',
      'packages/ui/package.json': '{ "name": "@acme/ui", "main": "./index.ts" }',
      'packages/ui/index.ts': '',
      'packages/plain/package.json': '{ "name": "plain-lib", "main": "./index.ts" }',
      'packages/plain/index.ts': '',
      'packages/near/package.json': '{ "name": "near-real", "main": "./index.ts" }',
      'packages/near/index.ts': '',
    });
    expect(r('core', 'packages/app/a.ts')).toBe('packages/core/index.ts');
    expect(r('ui-alias', 'packages/app/a.ts')).toBe('packages/ui/index.ts');
    expect(r('plain', 'packages/app/a.ts')).toBe('packages/plain/index.ts');
    expect(r('near', 'packages/app/a.ts')).toBe('packages/near/index.ts');
    expect(r('missing', 'packages/app/a.ts')).toBeUndefined();
  });
  // Issue 144: tsc reads a package `extends` from node_modules, where the package manager links members and local dependencies only, so the base config binds by the same rule as a bare import.
  describe('a tsconfig extends naming a package binds by the same rule (issue 144)', () => {
    const app = {
      'package.json': '{ "private": true, "workspaces": ["packages/*"] }',
      'packages/app/package.json': '{ "name": "app" }',
      'packages/app/tsconfig.json': '{ "extends": "@acme/preset" }',
      'packages/app/src/m.ts': '',
    };
    const member = {
      'packages/preset/package.json': '{ "name": "@acme/preset" }',
      'packages/preset/tsconfig.json': '{ "compilerOptions": { "paths": { "~/*": ["${configDir}/src/*"] } } }',
    };
    const fixture = {
      'packages/app/test/fixtures/preset/package.json': '{ "name": "@acme/preset" }',
      'packages/app/test/fixtures/preset/tsconfig.json': '{ "compilerOptions": { "paths": { "~/*": ["./fake/*"] } } }',
      'packages/app/test/fixtures/preset/fake/m.ts': '',
    };
    it('a fixture outside the globs that copies the member name does not hide the member', () => {
      expect(project({ ...app, ...member, ...fixture })('~/m', 'packages/app/src/a.ts')).toBe('packages/app/src/m.ts');
    });
    it('a fixture outside the globs is never the base config, so its paths never apply', () => {
      expect(project({ ...app, ...fixture })('~/m', 'packages/app/src/a.ts')).toBeUndefined();
    });
    it('a base the config package declares with a local spec binds there, and without a workspace any in-repo package still counts', () => {
      const local = project({
        ...app,
        ...fixture,
        'packages/app/package.json': '{ "name": "app", "devDependencies": { "@acme/preset": "file:../../tools/preset" } }',
        'tools/preset/package.json': '{ "name": "@acme/preset" }',
        'tools/preset/tsconfig.json': '{ "compilerOptions": { "paths": { "~/*": ["${configDir}/src/*"] } } }',
      });
      expect(local('~/m', 'packages/app/src/a.ts')).toBe('packages/app/src/m.ts');
      const undeclared = project({ ...app, 'package.json': '{ "private": true }', ...fixture });
      expect(undeclared('~/m', 'packages/app/src/a.ts')).toBe('packages/app/test/fixtures/preset/fake/m.ts');
    });
  });
  // Issue 178: tsc 5.0+ reads a package `extends` through the package's `exports` (a config lookup: CommonJS mode under NodeNext). Every expected base below is the one `tsc --showConfig` (6.0.3) read from the same layout under node_modules; each config sets a `paths` key naming itself.
  describe('a tsconfig extends naming a package reads its exports as tsc does (issue 178)', () => {
    const cfg = (name) => JSON.stringify({ compilerOptions: { paths: { [`marker/${name}`]: ['./x'] } } });
    const inherited = (ext, files, leaf = 'tsconfig.json') => {
      const root = materialize({ ...files, [leaf]: JSON.stringify({ extends: ext }) });
      const config = makeTsResolveDeps(root).tsconfigFor(path.posix.join(path.posix.dirname(leaf), 'x.ts'));
      return config === 'unknown' ? 'unknown' : Object.keys(config?.paths?.map ?? {}).join(',') || 'none';
    };
    const nm = (exportsField, files, extra = {}) => ({
      'node_modules/@acme/cfg/package.json': JSON.stringify({ name: '@acme/cfg', ...(exportsField === undefined ? {} : { exports: exportsField }), ...extra }),
      ...Object.fromEntries(Object.entries(files).map(([f, name]) => [`node_modules/@acme/cfg/${f}`, cfg(name)])),
    });
    const cases = [
      ['a string export is the root, over a tsconfig.json beside it', '@acme/cfg', nm('./base.json', { 'base.json': 'base', 'tsconfig.json': 'decoy' }), 'marker/base'],
      ['the "." key is the root', '@acme/cfg', nm({ '.': './configs/base.json' }, { 'configs/base.json': 'base', 'tsconfig.json': 'decoy' }), 'marker/base'],
      ['a subpath key, over the file of that name', '@acme/cfg/base', nm({ './base': './configs/tsconfig.base.json' }, { 'configs/tsconfig.base.json': 'base', 'base.json': 'decoy' }), 'marker/base'],
      ['require matches and import does not', '@acme/cfg', nm({ '.': { import: './esm.json', require: './cjs.json' } }, { 'esm.json': 'esm', 'cjs.json': 'cjs' }), 'marker/cjs'],
      ['types matches and browser does not', '@acme/cfg', nm({ '.': { browser: './browser.json', types: './types.json', default: './def.json' } }, { 'browser.json': 'browser', 'types.json': 'types', 'def.json': 'def' }), 'marker/types'],
      ['node matches and development does not', '@acme/cfg', nm({ '.': { development: './dev.json', node: './node.json', default: './def.json' } }, { 'dev.json': 'dev', 'node.json': 'node', 'def.json': 'def' }), 'marker/node'],
      ['a condition naming a missing file falls through to the next', '@acme/cfg', nm({ '.': { require: './missing.json', default: './def.json' } }, { 'def.json': 'def' }), 'marker/def'],
      ['an array falls through to its next entry', '@acme/cfg', nm({ '.': ['./missing.json', './second.json'] }, { 'second.json': 'second' }), 'marker/second'],
      ['nested conditions', '@acme/cfg/strict', nm({ './strict': { node: { import: './a.json', default: './b.json' } } }, { 'a.json': 'a', 'b.json': 'b' }), 'marker/b'],
      ['a * pattern', '@acme/cfg/strict', nm({ './*': './presets/*.json' }, { 'presets/strict.json': 'strict', 'strict.json': 'decoy' }), 'marker/strict'],
      ['the pattern with the longest prefix', '@acme/cfg/presets/strict', nm({ './*': './other/*.json', './presets/*': './p/*.json' }, { 'p/strict.json': 'p', 'other/presets/strict.json': 'other' }), 'marker/p'],
      ['a pattern with a trailer', '@acme/cfg/strict.json', nm({ './*.json': './p/*.json' }, { 'p/strict.json': 'p', 'strict.json': 'decoy' }), 'marker/p'],
      ['a key spelled with .json', '@acme/cfg/base.json', nm({ './base.json': './real.json' }, { 'real.json': 'real', 'base.json': 'decoy' }), 'marker/real'],
      ['the .json beside a .js, .ts or .d.ts target', '@acme/cfg', nm({ '.': './tsconfig.d.ts' }, { 'tsconfig.json': 'json-beside', 'tsconfig.d.ts': 'literal' }), 'marker/json-beside'],
      ['a subpath the exports do not list is not found, whatever the layout holds', '@acme/cfg/base', nm({ './other': './o.json' }, { 'o.json': 'o', 'base.json': 'decoy' }), 'none'],
      ['a root the exports do not list is not found', '@acme/cfg', nm({ './other': './o.json' }, { 'tsconfig.json': 'decoy' }), 'none'],
      ['a target without .json, .js, .ts or .d.ts names nothing', '@acme/cfg', nm({ '.': './tsconfig.jsonc' }, { 'tsconfig.jsonc': 'literal', 'tsconfig.json': 'decoy' }), 'none'],
      ['an extensionless target names nothing', '@acme/cfg', nm({ '.': './base' }, { base: 'bare', 'base.json': 'base', 'tsconfig.json': 'decoy' }), 'none'],
      ['a target not starting with ./ names nothing', '@acme/cfg', nm({ '.': 'base.json' }, { 'base.json': 'base', 'tsconfig.json': 'decoy' }), 'none'],
      ['a target through .. names nothing', '@acme/cfg', nm({ '.': './sub/../base.json' }, { 'base.json': 'base', 'tsconfig.json': 'decoy' }), 'none'],
      ['a pattern capture through .. names nothing', '@acme/cfg/x/../base', nm({ './*': './*.json' }, { 'base.json': 'base' }), 'none'],
      ['a null target blocks the subpath', '@acme/cfg/base', nm({ './*': './*.json', './base': null }, { 'base.json': 'decoy' }), 'none'],
      ['empty exports block everything', '@acme/cfg', nm({}, { 'tsconfig.json': 'decoy' }), 'none'],
      ['null exports are no exports', '@acme/cfg', nm(null, { 'tsconfig.json': 'plain' }), 'marker/plain'],
      ['no exports keep the layout', '@acme/cfg', nm(undefined, { 'tsconfig.json': 'plain' }), 'marker/plain'],
      // tsc 6.0.3 reads `types@>=4.0`; whether a versioned condition matches depends on the compiler's version, so the config is unknown.
      ['a versioned types condition is unknown', '@acme/cfg', nm({ '.': { 'types@>=99': './future.json', 'types@>=4.0': './now.json', default: './def.json' } }, { 'future.json': 'future', 'now.json': 'now', 'def.json': 'def' }), 'unknown'],
    ];
    for (const [name, ext, files, want] of cases) it(name, () => expect(inherited(ext, files)).toBe(want));
    it('a package whose exports name no file passes the lookup to the next node_modules up', () => {
      const files = {
        'app/node_modules/@acme/cfg/package.json': '{ "name": "@acme/cfg", "exports": { "./other": "./o.json" } }',
        'app/node_modules/@acme/cfg/tsconfig.json': cfg('inner-decoy'),
        'node_modules/@acme/cfg/package.json': '{ "name": "@acme/cfg", "exports": { ".": "./outer.json" } }',
        'node_modules/@acme/cfg/outer.json': cfg('outer'),
      };
      expect(inherited('@acme/cfg', files, 'app/tsconfig.json')).toBe('marker/outer');
    });
    it('a package naming itself reads its own exports, and a workspace member is read through its exports', () => {
      expect(inherited('@acme/self/base', { 'package.json': '{ "name": "@acme/self", "exports": { "./base": "./configs/base.json" } }', 'configs/base.json': cfg('self') })).toBe('marker/self');
      const workspace = {
        'package.json': '{ "private": true, "workspaces": ["packages/*"] }',
        'packages/preset/package.json': '{ "name": "@acme/preset", "exports": { "./base": { "require": "./configs/base.json" } } }',
        'packages/preset/configs/base.json': cfg('member'),
        'packages/preset/base.json': cfg('decoy'),
        'packages/app/package.json': '{ "name": "app" }',
      };
      expect(inherited('@acme/preset/base', workspace, 'packages/app/tsconfig.json')).toBe('marker/member');
    });
  });
  it('a member under an excluded directory or with an excluded package.json is not a member', () => {
    const files = {
      'package.json': '{ "workspaces": ["packages/*"] }',
      'packages/a/package.json': '{ "name": "a", "main": "./index.ts" }',
      'packages/a/index.ts': '',
      'packages/b/package.json': '{ "name": "b", "main": "./index.ts" }',
      'packages/b/index.ts': '',
    };
    const r = project(files, (p) => p === 'packages/a' || p === 'packages/b/package.json');
    expect(r('a', 'src/x.ts')).toBeUndefined();
    expect(r('b', 'src/x.ts')).toBeUndefined();
  });
});

// Issue 010: a verdict must be a function of the commit, so a file the caller excludes (git-ignored build output, a generated config) acts as though it does not exist, for every probe and every configuration read: the result with it on disk equals the result without it.
describe('resolveTsPath — an excluded file acts as though it does not exist', () => {
  const builtCore = {
    'packages/core/package.json': '{ "name": "@acme/core", "main": "./dist/index.js", "types": "./dist/index.d.ts", "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } } }',
    'packages/core/src/index.ts': '',
    'packages/app/src/main.ts': '',
  };
  const buildOutput = { 'packages/core/dist/index.js': '', 'packages/core/dist/index.d.ts': '' };
  const ignoredDist = (p) => p.startsWith('packages/core/dist/');

  it('a package whose exports point only into excluded build output resolves as in a clean checkout', () => {
    const clean = project(builtCore, ignoredDist);
    const built = project({ ...builtCore, ...buildOutput }, ignoredDist);
    expect(clean('@acme/core', 'packages/app/src/main.ts')).toBeUndefined();
    expect(built('@acme/core', 'packages/app/src/main.ts')).toBeUndefined();
  });
  it('the same holds through makeResolvePathToFile, the entry point a consumer calls', () => {
    const root = materialize({ ...builtCore, ...buildOutput });
    const resolve = makeResolvePathToFile(root, undefined, ignoredDist);
    expect(resolve('@acme/core', 'packages/app/src/main.ts', 'typescript')).toBeUndefined();
    // Without the exclusion the build output is a file like any other.
    expect(makeResolvePathToFile(root)('@acme/core', 'packages/app/src/main.ts', 'typescript')).toBe('packages/core/dist/index.d.ts');
  });
  it('an excluded exports condition target is skipped, so the next condition wins as in a clean checkout', () => {
    const conditions = {
      'packages/core/package.json': '{ "name": "@acme/core", "exports": { ".": { "types": "./dist/index.d.ts", "development": "./src/index.ts" } } }',
      'packages/core/src/index.ts': '',
    };
    expect(project(conditions, ignoredDist)('@acme/core', 'packages/app/src/main.ts')).toBe('packages/core/src/index.ts');
    expect(project({ ...conditions, ...buildOutput }, ignoredDist)('@acme/core', 'packages/app/src/main.ts')).toBe('packages/core/src/index.ts');
  });
  it('a main entry and a relative import into excluded output are silent, and a directory index skips an excluded file', () => {
    const files = {
      'packages/core/package.json': '{ "name": "@acme/core", "main": "./dist/index.js" }',
      'packages/core/dist/index.js': '',
      'gen/index.ts': '',
      'gen/index.js': '',
      'src/a.ts': '',
    };
    const excluded = (p) => p.startsWith('packages/core/dist/') || p === 'gen/index.ts';
    const r = project(files, excluded);
    expect(r('@acme/core', 'src/a.ts')).toBeUndefined();
    expect(r('../packages/core/dist/index.js', 'src/a.ts')).toBeUndefined();
    expect(r('../gen', 'src/a.ts')).toBe('gen/index.js');
  });
  it('a relative extends to an excluded generated tsconfig reads as missing (SvelteKit), so $lib stays silent either way', () => {
    const svelte = {
      'tsconfig.json': '{ "extends": "./.svelte-kit/tsconfig.json" }',
      'src/lib/x.ts': '',
      'src/routes/+page.server.ts': '',
    };
    const generated = { '.svelte-kit/tsconfig.json': '{ "compilerOptions": { "paths": { "$lib": ["../src/lib"], "$lib/*": ["../src/lib/*"] } } }' };
    const ignored = (p) => p.startsWith('.svelte-kit/');
    expect(project(svelte, ignored)('$lib/x', 'src/routes/+page.server.ts')).toBeUndefined();
    expect(project({ ...svelte, ...generated }, ignored)('$lib/x', 'src/routes/+page.server.ts')).toBeUndefined();
  });
  it('an excluded tsconfig.json or package.json is not read: the next one up is', () => {
    const r = project({
      'tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["./shared/*"] } } }',
      'apps/web/tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["./gen/*"] } } }',
      'apps/web/gen/m.ts': '',
      'shared/m.ts': '',
      'web/package.json': '{}',
      'web/src/x.ts': '',
    }, (p) => p === 'apps/web/tsconfig.json' || p === 'web/package.json');
    expect(r('@/m', 'apps/web/a.ts')).toBe('shared/m.ts');
    // The only package root was excluded, so a root-absolute import has none.
    expect(r('/src/x', 'web/src/pages/a.ts')).toBeUndefined();
  });
});

describe('parseJsonc', () => {
  it('strips comments and trailing commas, and leaves string contents alone', () => {
    expect(parseJsonc('{ // c\n "a": "x // y", /* b */ "b": [1, 2,], }')).toEqual({ a: 'x // y', b: [1, 2] });
    expect(parseJsonc('{ "a": "q\\"," }')).toEqual({ a: 'q",' });
    expect(parseJsonc('{ nope')).toBeUndefined();
  });
  it('reads a file that starts with a UTF-8 byte order mark, as tsc, Node and npm do', () => {
    expect(parseJsonc('﻿{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonc('﻿// c\n{ "a": [1,], }')).toEqual({ a: [1] });
    // Only a leading mark is a byte order mark; one anywhere else is still not JSON.
    expect(parseJsonc('{"a":1}﻿﻿')).toBeUndefined();
  });
});

describe('resolveTsPath — configuration files with a byte order mark', () => {
  const BOM = '﻿';
  it('reads the paths of a tsconfig.json saved with a BOM (issue 074, case 1)', () => {
    const r = project({
      'tsconfig.json': `${BOM}{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }`,
      'src/b/b.ts': '',
    });
    expect(r('@/b/b', 'src/a/a.ts')).toBe('src/b/b.ts');
  });
  it('a tsconfig.json with a BOM does not silence a workspace package import (case 1b)', () => {
    const r = project({
      'tsconfig.json': `${BOM}{ "compilerOptions": { "strict": true } }`,
      'packages/core/package.json': '{ "name": "@acme/core", "main": "./src/index.ts" }',
      'packages/core/src/index.ts': '',
    });
    expect(r('@acme/core', 'main.ts')).toBe('packages/core/src/index.ts');
  });
  it('a package.json with a BOM is still a workspace package (case 2)', () => {
    const r = project({
      'packages/core/package.json': `${BOM}{ "name": "@acme/core", "main": "./src/index.js" }`,
      'packages/core/src/index.js': '',
    });
    expect(r('@acme/core', 'packages/app/src/index.js')).toBe('packages/core/src/index.js');
  });
});
