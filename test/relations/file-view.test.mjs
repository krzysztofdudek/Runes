// Issue 235: resolution reads the files it is given a view of, not the disk, so a commit's edges do not depend on what is built or installed beside it. The whole catalogue runs through a listed view too (reference-case-runner.mjs); these tests hold the view itself and the cases the catalogue cannot reach (a file on disk that the view does not list).
import { describe, it, expect, beforeEach, afterEach } from '../helpers/expect.mjs';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { makeResolvePathToFile, buildCsharpProjectScopes, listedFileView } from '@chrisdudek/runes/relations';

/** Writes `files` (repo-relative path → text) under a fresh temporary directory. */
function materialize(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'file-view-'));
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text, 'utf-8');
  }
  return root;
}

/** A listed view over `files` (the commit), reading their text from the same map. */
function commitView(files, listed = Object.keys(files)) {
  return listedFileView(listed, (p) => files[p]);
}

describe('listedFileView', () => {
  const view = commitView({ 'a/b/c.ts': 'C', 'a/d.ts': 'D', 'top.ts': 'T' });

  it('implies the directories of the listed files, the root among them', () => {
    expect(view.isDirectory('')).toBe(true);
    expect(view.exists('')).toBe(true);
    expect(view.isDirectory('a')).toBe(true);
    expect(view.isDirectory('a/b')).toBe(true);
    expect(view.isFile('a/b')).toBe(false);
    expect(view.isFile('a/b/c.ts')).toBe(true);
    expect(view.isDirectory('a/b/c.ts')).toBe(false);
    expect(view.exists('a/e.ts')).toBe(false);
  });

  it('lists a directory sorted, files and directories apart, and nothing for what is not a directory', () => {
    expect(view.list('')).toEqual([{ name: 'a', kind: 'dir' }, { name: 'top.ts', kind: 'file' }]);
    expect(view.list('a')).toEqual([{ name: 'b', kind: 'dir' }, { name: 'd.ts', kind: 'file' }]);
    expect(view.list('a/d.ts')).toBeUndefined();
    expect(view.list('nope')).toBeUndefined();
  });

  it('reads only a listed file and keeps the text as it is', () => {
    expect(view.read('a/d.ts')).toBe('D');
    expect(view.read('a')).toBeUndefined();
    expect(view.read('missing.ts')).toBeUndefined();
    expect(commitView({ 'x.json': '﻿{}' }).read('x.json')).toBe('﻿{}');
  });

  it('reads one spelling of a path, and compares names exactly', () => {
    expect(view.isFile('./a//d.ts')).toBe(true);
    expect(view.isDirectory('a/')).toBe(true);
    expect(view.isDirectory('.')).toBe(true);
    expect(view.exists('A/d.ts')).toBe(false);
    expect(view.exists('a/D.ts')).toBe(false);
  });

  it('holds no path that is absolute or climbs out of the root', () => {
    const odd = commitView({ ok: 'x' }, ['ok', '/abs.ts', '../out.ts', 'a/../b.ts', '', '.']);
    expect(odd.exists('/abs.ts')).toBe(false);
    expect(odd.exists('../out.ts')).toBe(false);
    expect(odd.exists('../ok')).toBe(false);
    expect(odd.isFile('b.ts')).toBe(true);
    expect(odd.list('')).toEqual([{ name: 'b.ts', kind: 'file' }, { name: 'ok', kind: 'file' }]);
  });

  it('lets a later listing of a directory name win over a file of the same name, as the paths imply it', () => {
    const both = commitView({}, ['x', 'x/y.ts']);
    expect(both.isDirectory('x')).toBe(true);
    expect(both.list('')).toEqual([{ name: 'x', kind: 'dir' }]);
    const reverse = commitView({}, ['x/y.ts', 'x']);
    expect(reverse.list('')).toEqual([{ name: 'x', kind: 'dir' }]);
  });
});

describe('a resolver given a view reads the view, not the disk', () => {
  const dirs = [];
  const make = (files) => {
    const root = materialize(files);
    dirs.push(root);
    return root;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const workspace = {
    'package.json': '{ "private": true, "workspaces": ["packages/*"] }',
    'packages/core/package.json': '{ "name": "@acme/core", "exports": "./dist/index.js", "main": "./src/index.ts" }',
    'packages/core/src/index.ts': 'export const core = 1;\n',
    'packages/app/package.json': '{ "name": "@acme/app" }',
    'packages/app/src/a.ts': 'import "@acme/core";\n',
  };

  it('does not follow an exports entry into a dist/ that is built on disk but not in the commit', () => {
    const built = make({ ...workspace, 'packages/core/dist/index.js': 'module.exports = {};\n' });
    const clean = make(workspace);
    const from = 'packages/app/src/a.ts';
    const onBuiltDisk = makeResolvePathToFile(built)('@acme/core', from, 'typescript');
    const onCleanDisk = makeResolvePathToFile(clean)('@acme/core', from, 'typescript');
    expect(onBuiltDisk).toBe('packages/core/dist/index.js');
    expect(onCleanDisk).not.toBe(onBuiltDisk);
    const throughView = makeResolvePathToFile(built, undefined, undefined, { files: commitView(workspace) })('@acme/core', from, 'typescript');
    expect(throughView).toBe(onCleanDisk);
  });

  it('gives the same edges whether dist/ is present on disk or not', () => {
    const built = make({ ...workspace, 'packages/core/dist/index.js': 'module.exports = {};\n' });
    const clean = make(workspace);
    const files = commitView(workspace);
    const from = 'packages/app/src/a.ts';
    const a = makeResolvePathToFile(built, undefined, undefined, { files })('@acme/core', from, 'typescript');
    const b = makeResolvePathToFile(clean, undefined, undefined, { files })('@acme/core', from, 'typescript');
    expect(a).toBe(b);
  });

  it('reads no generated tsconfig the commit does not hold (SvelteKit)', () => {
    const files = {
      'tsconfig.json': '{ "extends": "./.svelte-kit/tsconfig.json" }',
      'src/lib/x.ts': '',
      'src/routes/+page.ts': '',
    };
    const generated = '{ "compilerOptions": { "paths": { "$lib": ["../src/lib"], "$lib/*": ["../src/lib/*"] } } }';
    const root = make({ ...files, '.svelte-kit/tsconfig.json': generated });
    expect(makeResolvePathToFile(root)('$lib/x', 'src/routes/+page.ts', 'typescript')).toBe('src/lib/x.ts');
    expect(makeResolvePathToFile(root, undefined, undefined, { files: commitView(files) })('$lib/x', 'src/routes/+page.ts', 'typescript')).toBeUndefined();
    const withIt = { ...files, '.svelte-kit/tsconfig.json': generated };
    expect(makeResolvePathToFile(root, undefined, undefined, { files: commitView(withIt) })('$lib/x', 'src/routes/+page.ts', 'typescript')).toBe('src/lib/x.ts');
  });

  it('reads a pyproject.toml only when the view lists it', () => {
    const files = { 'proj/pyproject.toml': '[project]\nname = "p"\n', 'proj/src/pkg/__init__.py': '', 'proj/src/pkg/mod.py': '', 'app/main.py': 'import pkg.mod\n' };
    const root = make(files);
    expect(makeResolvePathToFile(root)('pkg.mod', 'app/main.py', 'python')).toBe('proj/src/pkg/mod.py');
    const unlisted = Object.keys(files).filter((p) => p !== 'proj/pyproject.toml');
    expect(makeResolvePathToFile(root, undefined, undefined, { files: commitView(files, unlisted) })('pkg.mod', 'app/main.py', 'python')).toBeUndefined();
    expect(makeResolvePathToFile(root, undefined, undefined, { files: commitView(files) })('pkg.mod', 'app/main.py', 'python')).toBe('proj/src/pkg/mod.py');
  });

  it('reads a .csproj only when the view lists it (C# project scopes)', () => {
    const files = {
      'App/App.csproj': '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><ImplicitUsings>enable</ImplicitUsings></PropertyGroup></Project>',
      'App/A.cs': 'class A {}',
    };
    const root = make(files);
    const facts = [{ path: 'App/A.cs', globalPrefixes: [], globalAliases: [] }];
    expect(buildCsharpProjectScopes(root, facts).get('App/A.cs').usings).toContain('System');
    expect(buildCsharpProjectScopes(root, facts, { files: commitView(files, ['App/A.cs']) }).get('App/A.cs').usings).toEqual([]);
    expect(buildCsharpProjectScopes(root, facts, { files: commitView(files) }).get('App/A.cs').usings).toContain('System');
  });

  it('does not see a symbolic link the view does not list', () => {
    const root = make({ 'real.ts': '', 'a.ts': '' });
    symlinkSync(path.join(root, 'real.ts'), path.join(root, 'link.ts'));
    expect(makeResolvePathToFile(root)('./link', 'a.ts', 'typescript')).toBe('link.ts');
    expect(makeResolvePathToFile(root, undefined, undefined, { files: commitView({ 'real.ts': '', 'a.ts': '' }) })('./link', 'a.ts', 'typescript')).toBeUndefined();
  });

  it('compares names exactly in a view: lib/Root.rs is absent where lib/root.rb is listed', () => {
    const files = { 'lib/a.rb': '', 'lib/root.rb': '' };
    const resolve = makeResolvePathToFile(path.join(tmpdir(), 'file-view-absent-root'), undefined, undefined, { files: commitView(files) });
    expect(resolve('./root', 'lib/a.rb', 'ruby')).toBe('lib/root.rb');
    expect(resolve('./Root', 'lib/a.rb', 'ruby')).toBeUndefined();
  });

  it('never touches the disk when a view is given: a project root that does not exist resolves as the view says', () => {
    const files = {
      'go.mod': 'module ex.com/m\n',
      'pkg/a.go': 'package pkg\n',
      'cmd/main.go': 'package main\n',
      'src/com/acme/Foo.java': 'package com.acme;\n',
      'src/app/App.java': 'package app;\n',
      'Cargo.toml': '[package]\nname = "c"\n',
      'src/lib.rs': 'pub mod m;\n',
      'src/m.rs': '',
      'composer.json': '{ "autoload": { "psr-4": { "App\\\\": "app/" } } }',
      'app/Foo.php': '<?php\n',
      'include/lib/h.h': '',
      'main.c': '',
    };
    const resolve = makeResolvePathToFile(path.join(tmpdir(), 'file-view-absent-root'), undefined, undefined, { files: commitView(files) });
    expect(resolve('ex.com/m/pkg', 'cmd/main.go', 'go')).toBe('pkg/a.go');
    expect(resolve('com.acme.Foo', 'src/app/App.java', 'java')).toBe('src/com/acme/Foo.java');
    expect(resolve('com.acme', 'src/app/App.java', 'java', true)).toBe('src/com/acme/Foo.java');
    expect(resolve('crate::m', 'src/lib.rs', 'rust')).toBe('src/m.rs');
    expect(resolve('App\\Foo', 'app/Foo.php', 'php')).toBe('app/Foo.php');
    expect(resolve('lib/h.h', 'main.c', 'c')).toBe('include/lib/h.h');
  });
});
