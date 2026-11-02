// Issue 234: a configuration file that resolution consults and cannot read is reported through `onDiagnostic`, once, at the line and column of the file as written; resolution itself is unchanged.
import { describe, it, expect, afterEach } from '../helpers/expect.mjs';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { makeResolvePathToFile, listedFileView } from '@chrisdudek/runes/relations';
import { parseJsoncAt, lineColumnAt, failureOffset, strictJsonFailure, makeDiagnosticSink, reportUnreadable } from '../helpers/internal/relations.mjs';

/** A resolver over a listed view of `files`, collecting what it reports. */
function resolverOver(files) {
  const diagnostics = [];
  const view = listedFileView(Object.keys(files), (p) => files[p]);
  const resolve = makeResolvePathToFile(path.join(tmpdir(), 'diagnostics-absent-root'), undefined, undefined, { files: view, onDiagnostic: (d) => diagnostics.push(d) });
  return { resolve, diagnostics };
}

// A comment and a trailing comma before the failure: the position must be the one in this text, not in the stripped text JSON.parse reads.
const BROKEN_TSCONFIG = '// generated\n{\n  "compilerOptions": {\n    "paths": { "@/*": ["./src/*",] }\n  }\n  "include": ["src"]\n}\n';

describe('config-unreadable', () => {
  it('reports a tsconfig that does not parse once, however many imports consult it, at its own line', () => {
    const { resolve, diagnostics } = resolverOver({ 'tsconfig.json': BROKEN_TSCONFIG, 'src/a.ts': '', 'src/x.ts': '' });
    for (let i = 0; i < 50; i++) expect(resolve(`@/x${i}`, 'src/a.ts', 'typescript')).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('config-unreadable');
    expect(diagnostics[0].file).toBe('tsconfig.json');
    expect(diagnostics[0].line).toBe(6);
    expect(diagnostics[0].column).toBeGreaterThan(0);
    expect(diagnostics[0].message).toContain('tsconfig.json');
  });

  it('keeps resolution as it was: the broken file governs nothing, and the same layout with a valid file resolves', () => {
    const valid = '// generated\n{\n  "compilerOptions": {\n    "paths": { "@/*": ["./src/*",] }\n  },\n  "include": ["src"]\n}\n';
    const ok = resolverOver({ 'tsconfig.json': valid, 'src/a.ts': '', 'src/x.ts': '' });
    expect(ok.resolve('@/x', 'src/a.ts', 'typescript')).toBe('src/x.ts');
    expect(ok.diagnostics).toEqual([]);
  });

  it('reports nothing for a valid file and nothing for a file with a byte order mark', () => {
    const bom = resolverOver({ 'tsconfig.json': '\uFEFF// c\n{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }', 'src/a.ts': '', 'src/x.ts': '' });
    expect(bom.resolve('@/x', 'src/a.ts', 'typescript')).toBe('src/x.ts');
    expect(bom.diagnostics).toEqual([]);
    const pkgBom = resolverOver({ 'package.json': '\uFEFF{ "name": "root" }', 'src/a.ts': '' });
    pkgBom.resolve('left-pad', 'src/a.ts', 'typescript');
    expect(pkgBom.diagnostics).toEqual([]);
  });

  it('reads a composer.json and a compile_commands.json with a byte order mark, and reports nothing', () => {
    const composer = resolverOver({ 'composer.json': '\uFEFF{ "autoload": { "psr-4": { "App\\\\": "src/" } } }', 'src/Foo.php': '' });
    expect(composer.resolve('App\\Foo', 'src/Foo.php', 'php')).toBe('src/Foo.php');
    expect(composer.diagnostics).toEqual([]);
    const db = resolverOver({ 'compile_commands.json': '\uFEFF[{"directory":"/repo-absent","file":"main.c","command":"cc -Iinc main.c"}]', 'main.c': '', 'inc/h.h': '' });
    db.resolve('<h.h>', 'main.c', 'c');
    expect(db.diagnostics).toEqual([]);
  });

  it('reports a failure behind a byte order mark at its position in the file as written', () => {
    const { resolve, diagnostics } = resolverOver({ 'composer.json': '\uFEFF{ "a" 1 }', 'src/Foo.php': '' });
    resolve('App\\Foo', 'src/Foo.php', 'php');
    expect(diagnostics[0]).toMatchObject({ line: 1, column: 7 });
  });

  it('places a failure where the parser names no position (a single-quoted string, an unquoted value) at the offending token, not at the start of the file', () => {
    const quoted = resolverOver({ 'tsconfig.json': '{\n  "compilerOptions": {\n    "baseUrl": ".",\n    "paths": { "@/*": [\'./src/*\'] }\n  }\n}\n', 'src/a.ts': '', 'src/x.ts': '' });
    expect(quoted.resolve('@/x', 'src/a.ts', 'typescript')).toBeUndefined();
    expect(quoted.diagnostics).toHaveLength(1);
    expect(quoted.diagnostics[0]).toMatchObject({ file: 'tsconfig.json', line: 4, column: 24 });
    expect(quoted.diagnostics[0].message).toContain('line 4, column 24');
    const unquoted = resolverOver({ 'package.json': '{\n  "main": ./src/index.ts\n}', 'src/a.ts': '' });
    unquoted.resolve('left-pad', 'src/a.ts', 'typescript');
    expect(unquoted.diagnostics).toHaveLength(1);
    expect(unquoted.diagnostics[0]).toMatchObject({ file: 'package.json', line: 2, column: 11 });
  });

  it('reports the file without a position, and a message that names none, when no position can be found', () => {
    const got = [];
    reportUnreadable(makeDiagnosticSink((d) => got.push(d)), 'a.json', {}, 'it is not used');
    expect(got).toEqual([{ code: 'config-unreadable', file: 'a.json', message: 'a.json does not parse; it is not used' }]);
  });

  it('reports nothing for a broken file no resolution consulted', () => {
    const { resolve, diagnostics } = resolverOver({ 'tsconfig.json': BROKEN_TSCONFIG, 'src/a.ts': '', 'src/b.ts': '' });
    expect(resolve('./b', 'src/a.ts', 'typescript')).toBe('src/b.ts');
    expect(diagnostics).toEqual([]);
  });

  it('reports a jsconfig the same way', () => {
    const { resolve, diagnostics } = resolverOver({ 'jsconfig.json': '{\n "a": 1\n "b": 2\n}', 'src/a.js': '' });
    resolve('@/x', 'src/a.js', 'javascript');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'config-unreadable', file: 'jsconfig.json', line: 3 });
  });

  it('reports a broken package.json of a workspace member when a bare import reaches it', () => {
    const files = {
      'package.json': '{ "private": true, "workspaces": ["packages/*"] }',
      'packages/core/package.json': '{ "name": "@acme/core",\n "main": ./src/index.ts }',
      'packages/core/src/index.ts': '',
      'packages/app/package.json': '{ "name": "@acme/app" }',
      'packages/app/src/a.ts': '',
    };
    const quiet = resolverOver(files);
    quiet.resolve('./b', 'packages/app/src/a.ts', 'typescript');
    expect(quiet.diagnostics).toEqual([]);
    const { resolve, diagnostics } = resolverOver(files);
    expect(resolve('@acme/core', 'packages/app/src/a.ts', 'typescript')).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'config-unreadable', file: 'packages/core/package.json', line: 2 });
  });

  it('reports a pnpm-workspace.yaml whose packages list it cannot read, and not one it can', () => {
    const base = { 'package.json': '{ "name": "root" }', 'src/a.ts': '' };
    for (const yaml of ['packages: apps/*\n', 'packages: [apps/*, libs/*\n', 'packages:\n  apps/*\n']) {
      const { resolve, diagnostics } = resolverOver({ ...base, 'pnpm-workspace.yaml': yaml });
      resolve('@acme/core', 'src/a.ts', 'typescript');
      expect(diagnostics.map((d) => [d.code, d.file])).toEqual([['config-unreadable', 'pnpm-workspace.yaml']]);
    }
    for (const yaml of ['packages:\n  - apps/*\n', "packages: ['apps/*']\n", 'catalog:\n  a: 1\n', 'packages:\n', 'packages:\n# c\n\nother: 1\n', 'packages: # none\n  - x\n']) {
      const { resolve, diagnostics } = resolverOver({ ...base, 'pnpm-workspace.yaml': yaml });
      resolve('@acme/core', 'src/a.ts', 'typescript');
      expect(diagnostics).toEqual([]);
    }
  });

  it('reports a composer.json that does not parse when a PHP resolution consults it, once for both lookups', () => {
    const { resolve, diagnostics } = resolverOver({ 'composer.json': '{ "autoload": ', 'src/Foo.php': '' });
    expect(resolve('App\\Foo', 'src/Foo.php', 'php')).toBeUndefined();
    expect(resolve('App\\Bar', 'src/Foo.php', 'php')).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'config-unreadable', file: 'composer.json', line: 1 });
    const valid = resolverOver({ 'composer.json': '{ "autoload": { "psr-4": { "App\\\\": "src/" } } }', 'src/Foo.php': '' });
    expect(valid.resolve('App\\Foo', 'src/Foo.php', 'php')).toBe('src/Foo.php');
    expect(valid.diagnostics).toEqual([]);
  });

  it('reports a compile_commands.json that does not parse when a C include consults it, and names the one in build/ as its own file', () => {
    const files = { 'compile_commands.json': '[ {', 'build/compile_commands.json': '[]x', 'main.c': '', 'inc/h.h': '' };
    const { resolve, diagnostics } = resolverOver(files);
    resolve('<h.h>', 'main.c', 'c');
    resolve('"inc/h.h"', 'main.c', 'c');
    expect(diagnostics.map((d) => d.file).sort()).toEqual(['build/compile_commands.json', 'compile_commands.json']);
  });

  it('reads the disk the same way when no view is given', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'diagnostics-'));
    try {
      mkdirSync(path.join(root, 'src'));
      writeFileSync(path.join(root, 'tsconfig.json'), BROKEN_TSCONFIG);
      writeFileSync(path.join(root, 'src', 'a.ts'), '');
      const diagnostics = [];
      const resolve = makeResolvePathToFile(root, undefined, undefined, { onDiagnostic: (d) => diagnostics.push(d) });
      resolve('@/x', 'src/a.ts', 'typescript');
      expect(diagnostics.map((d) => [d.code, d.file, d.line])).toEqual([['config-unreadable', 'tsconfig.json', 6]]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('is silent without a callback', () => {
    const view = listedFileView(['tsconfig.json', 'src/a.ts', 'composer.json', 'compile_commands.json'], () => '{');
    const resolve = makeResolvePathToFile(path.join(tmpdir(), 'diagnostics-absent-root'), undefined, undefined, { files: view });
    expect(resolve('@/x', 'src/a.ts', 'typescript')).toBeUndefined();
    expect(resolve('A\\B', 'src/a.ts', 'php')).toBeUndefined();
  });
});

describe('the pieces behind it', () => {
  it('parseJsoncAt maps a failure back through comments and trailing commas, and a BOM, to the original text', () => {
    expect(parseJsoncAt('{ "a": 1 }')).toEqual({ value: { a: 1 } });
    expect(parseJsoncAt('\uFEFF{ "a": [1,], }').failure).toBeUndefined();
    expect(parseJsoncAt('/* x\ny */ {\n "a": 1 // c\n "b": 2 }').failure).toEqual({ line: 4, column: 2 });
    expect(parseJsoncAt('{ "a": 1').failure).toEqual({ line: 1, column: 9 });
    expect(parseJsoncAt('{\n// c\n"a": undefined, }').failure).toEqual({ line: 3, column: 6 });
    expect(parseJsoncAt('').failure).toEqual({ line: 1, column: 1 });
    expect(parseJsoncAt('{\n"a": "unterminated').failure.line).toBe(2);
  });

  it('lineColumnAt counts from 1 and clamps', () => {
    expect(lineColumnAt('ab\ncd', 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumnAt('ab\ncd', 4)).toEqual({ line: 2, column: 2 });
    expect(lineColumnAt('ab\ncd', 99)).toEqual({ line: 2, column: 3 });
    expect(lineColumnAt('ab', -3)).toEqual({ line: 1, column: 1 });
  });

  it('lineColumnAt counts LF, CR and CRLF each as one line break', () => {
    expect(lineColumnAt('ab\rcd', 4)).toEqual({ line: 2, column: 2 });
    expect(lineColumnAt('ab\r\ncd', 5)).toEqual({ line: 2, column: 2 });
    expect(lineColumnAt('ab\r\ncd', 3)).toEqual({ line: 1, column: 4 });
    expect(lineColumnAt('a\r\n\r\nb', 5)).toEqual({ line: 3, column: 1 });
    expect(lineColumnAt('a\r\rb\nc', 5)).toEqual({ line: 4, column: 1 });
    expect(lineColumnAt('a\rb\nc\r\nd', 8)).toEqual({ line: 4, column: 2 });
  });

  it('failureOffset reads the position JSON.parse names, the end for an unexpected end of input, else the first token that cannot belong, else nothing', () => {
    expect(failureOffset(new Error('x in JSON at position 7 (line 1 column 8)'), '12345678901234567890')).toBe(7);
    expect(failureOffset(new Error('Unexpected end of JSON input'), '{ "a": ')).toBe(7);
    expect(failureOffset(new Error('x in JSON at position 90'), '12345')).toBe(5);
    const tok = (c, text) => new Error(`Unexpected token '${c}', "${text}" is not valid JSON`);
    expect(failureOffset(tok("'", "{ \"a\": ['x'] }"), "{ \"a\": ['x'] }")).toBe(8);
    expect(failureOffset(tok('u', '{ "a": undefined }'), '{ "a": undefined }')).toBe(7);
    expect(failureOffset(tok(' ', '{ "a": nul }'), '{ "a": nul }')).toBe(10);
    expect(failureOffset(tok('n', '{ "a": nnull }'), '{ "a": nnull }')).toBe(8);
    expect(failureOffset(tok('n', '{ "a": nul }'), '{ "a": nul }')).toBeUndefined();
    expect(failureOffset(tok('x', '{ "a": "x }'), '{ "a": "x }')).toBeUndefined();
    expect(failureOffset(tok('-', '[-, 1]'), '[-, 1.5e3, -0.1, true, false, null, "a\\"b"]')).toBe(1);
    expect(failureOffset(tok(']', '[-0.1]'), '[-0.1, 1.5e3, true, false, null, "a\\"b", {}]')).toBeUndefined();
    // the quoted character must be the one at the scanner's offset, else no position
    expect(failureOffset(tok(',', '{"a": ,\n"b": \'x\'}'), '{"a": ,\n"b": \'x\'}')).toBeUndefined();
    // a position inside the quoted snippet is not a position
    expect(failureOffset(tok("'", "{\"a\": 'in JSON at position 5'}"), "{\"a\": 'in JSON at position 5'}")).toBe(6);
    expect(failureOffset('not an error', '{}')).toBeUndefined();
    expect(strictJsonFailure('{}')).toBeUndefined();
    expect(strictJsonFailure('{ "a" 1 }')).toEqual({ line: 1, column: 7 });
    expect(strictJsonFailure('{ "a": ')).toEqual({ line: 1, column: 8 });
    expect(strictJsonFailure("{ 'a': 1 }")).toEqual({ line: 1, column: 3 });
    expect(strictJsonFailure('\uFEFF{}')).toBeUndefined();
  });

  it('the sink hands each pair on once and builds the position only when there is one', () => {
    const got = [];
    const sink = makeDiagnosticSink((d) => got.push(d));
    sink('c', 'f', 'm');
    sink('c', 'f', 'again');
    sink('c', 'g', 'm', { line: 2, column: 3 });
    expect(got).toEqual([{ code: 'c', file: 'f', message: 'm' }, { code: 'c', file: 'g', line: 2, column: 3, message: 'm' }]);
    expect(makeDiagnosticSink(undefined)).toBeUndefined();
  });
});
