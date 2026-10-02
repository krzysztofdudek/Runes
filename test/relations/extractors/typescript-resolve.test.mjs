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
  it('reads a pnpm-workspace.yaml flow list, and one with no packages list means every directory', () => {
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
    expect(r('a', 'e2e/demo/src/x.ts')).toBeUndefined();
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
