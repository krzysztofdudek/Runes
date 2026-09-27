import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const SUBPATHS = ['relations', 'ast', 'grammars', 'fs', 'cli', 'mcp', 'testkit'];

test('package.json declares exactly the agreed subpaths', () => {
  const code = Object.keys(pkg.exports).filter((k) => !k.endsWith('.json')).map((k) => k.slice(2));
  assert.deepEqual(code.sort(), [...SUBPATHS].sort());
});

test('zero runtime dependencies; web-tree-sitter only as an optional peer', () => {
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(Object.keys(pkg.peerDependencies ?? {}), ['web-tree-sitter']);
  assert.equal(pkg.peerDependenciesMeta['web-tree-sitter'].optional, true);
  assert.equal(pkg.engines.node, '>=22');
});

for (const sub of SUBPATHS) {
  test(`@chrisdudek/runes/${sub} resolves, has types, and reports the package version`, async () => {
    const entry = pkg.exports[`./${sub}`];
    assert.ok(existsSync(join(root, entry.types)), `missing ${entry.types}`);
    assert.ok(existsSync(join(root, entry.import)), `missing ${entry.import}`);
    const mod = await import(`@chrisdudek/runes/${sub}`);
    assert.equal(mod.version, pkg.version);
    assert.equal(mod.subpath, sub);
  });
}

test('the top CHANGELOG section is the package version', () => {
  const top = /^## \[([^\]]+)\]/m.exec(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'));
  assert.equal(top?.[1], pkg.version);
});
