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
  });
}

// docs/api.md is the stable 1.x surface: one table per subpath, one row per exported name. The page and the package's exports agree both ways, value exports read from the module and type exports from its index.d.mts, so a name cannot enter or leave the promise without the page saying so.
const API = readFileSync(join(root, 'docs', 'api.md'), 'utf8');
const documented = (sub) => {
  const section = API.split(/^## /m).find((s) => s.startsWith(`\`@chrisdudek/runes/${sub}\``));
  assert.ok(section, `docs/api.md has no section for ${sub}`);
  return new Map([...section.matchAll(/^\| `([^`]+)` \| (value|type) \|/gm)].map((m) => [m[1], m[2]]));
};
const exportedTypes = (sub) => {
  const dts = readFileSync(join(root, 'dist', sub, 'index.d.mts'), 'utf8');
  const names = [];
  for (const m of dts.matchAll(/export (type )?\{([^}]*)\}/g)) {
    for (const raw of m[2].split(',').map((n) => n.trim()).filter(Boolean)) {
      if (m[1] || raw.startsWith('type ')) names.push(raw.replace(/^type\s+/, '').split(/\s+as\s+/).pop());
    }
  }
  return names;
};
for (const sub of SUBPATHS) {
  test(`@chrisdudek/runes/${sub} exports exactly what docs/api.md lists`, async () => {
    const doc = documented(sub);
    const values = Object.keys(await import(`@chrisdudek/runes/${sub}`)).sort();
    const types = exportedTypes(sub).sort();
    assert.deepEqual(values, [...doc].filter(([, k]) => k === 'value').map(([n]) => n).sort(), 'value exports');
    assert.deepEqual(types, [...doc].filter(([, k]) => k === 'type').map(([n]) => n).sort(), 'type exports');
  });
}

test('the vendoring module paths docs/api.md promises exist and export what they did', async () => {
  const modules = {
    'dist/version.mjs': ['RUNES_VERSION'],
    'dist/testkit/parity.mjs': ['assertParity', 'parityProblems'],
    'dist/testkit/measure.mjs': ['formatToolsMeasure', 'measureTools'],
    'dist/testkit/client.mjs': ['listToolsOverStdio', 'startMcpClient'],
    'dist/testkit/runtime/index.mjs': ['checkRuntimePins', 'formatRuntimePinReport'],
  };
  for (const [file, names] of Object.entries(modules)) {
    assert.ok(API.includes(`\`${file}\``), `docs/api.md names ${file}`);
    const mod = await import(new URL(`../${file}`, import.meta.url));
    for (const n of names) assert.equal(typeof mod[n] === 'undefined', false, `${file} exports ${n}`);
  }
});

test('the top released CHANGELOG section is the package version', () => {
  const top = /^## \[(\d[^\]]*)\]/m.exec(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'));
  assert.equal(top?.[1], pkg.version);
});
