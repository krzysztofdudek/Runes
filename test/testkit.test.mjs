import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, readFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitEnv, gitLocalEnvVars, makeTempRepo, TEST_GIT_CONFIG, parityProblems, assertParity, measureTools, formatToolsMeasure, listToolsOverStdio, startMcpClient, runtimePinProblems } from '@chrisdudek/runes/testkit';
import { buildTools } from '@chrisdudek/runes/mcp';
import { TABLE, USAGE } from './fixtures/demo-tool.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, 'fixtures', 'demo-mcp.mjs');

describe('git environment', () => {
  test('drops every repository-locating variable and inherited config entry, then adds the test config', () => {
    const env = gitEnv({ GIT_DIR: '/elsewhere/.git', GIT_INDEX_FILE: '/elsewhere/index', GIT_WORK_TREE: '/elsewhere', GIT_COMMON_DIR: '/x', GIT_OBJECT_DIRECTORY: '/y', GIT_CONFIG_PARAMETERS: "'a.b'='c'", GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'x.y', GIT_CONFIG_VALUE_0: 'z', KEEP: '1' }, { name: 'N', email: 'e@x', config: { 'x.y': 'mine' } });
    for (const k of gitLocalEnvVars()) if (k !== 'GIT_CONFIG_COUNT') assert.equal(env[k], undefined, k);
    assert.equal(env.KEEP, '1');
    const pairs = Object.fromEntries(Array.from({ length: Number(env.GIT_CONFIG_COUNT) }, (_, i) => [env[`GIT_CONFIG_KEY_${i}`], env[`GIT_CONFIG_VALUE_${i}`]]));
    assert.equal(pairs['maintenance.auto'], 'false');
    assert.equal(pairs['gc.auto'], '0');
    assert.equal(pairs['user.email'], 'e@x');
    assert.equal(pairs['x.y'], 'mine');
    assert.ok(existsSync(pairs['core.hooksPath']) && statSync(pairs['core.hooksPath']).isDirectory(), 'hooks: an empty directory');
    assert.ok(statSync(env.GIT_CONFIG_GLOBAL).isFile() && readFileSync(env.GIT_CONFIG_GLOBAL, 'utf8') === '', 'global config: an empty file');
    assert.equal(env.GIT_CONFIG_NOSYSTEM, '1');
    assert.equal(env.GIT_AUTHOR_NAME, 'N');
    assert.equal(env.GIT_COMMITTER_EMAIL, 'e@x');
    for (const v of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY']) assert.ok(gitLocalEnvVars().includes(v), v);
    assert.deepEqual(Object.keys(TEST_GIT_CONFIG).slice(0, 2), ['maintenance.auto', 'gc.auto']);
  });

  test('makeTempRepo inside a hook-like environment (GIT_DIR and GIT_INDEX_FILE of another repository) commits into its own repository only', () => {
    const outer = makeTempRepo({ files: { 'o.txt': 'outer\n' } });
    try {
      const head = outer.git('rev-parse', 'HEAD').trim();
      const hookEnv = { ...process.env, GIT_DIR: join(outer.dir, '.git'), GIT_INDEX_FILE: join(outer.dir, '.git', 'index'), GIT_WORK_TREE: outer.dir };
      const inner = makeTempRepo({ env: hookEnv, files: { 'i.txt': 'inner\n' } });
      try {
        assert.equal(inner.git('rev-list', '--count', 'HEAD').trim(), '1');
        assert.equal(inner.git('ls-files').trim(), 'i.txt');
        assert.equal(realpathSync(inner.git('rev-parse', '--show-toplevel').trim()), inner.dir);
      } finally { inner.cleanup(); }
      assert.equal(outer.git('rev-parse', 'HEAD').trim(), head, 'the outer repository got no commit');
      assert.equal(outer.git('ls-files').trim(), 'o.txt', 'nor a staged file');
    } finally { outer.cleanup(); }
  });

  test('git in a temp repository sees the settings, the identity, and nothing of the user config; commits repeat', () => {
    const a = makeTempRepo({ files: { 'a.txt': 'one\n', 'd/b.txt': 'two\n' } });
    const b = makeTempRepo({ files: { 'a.txt': 'one\n', 'd/b.txt': 'two\n' } });
    try {
      assert.equal(a.git('config', '--get', 'maintenance.auto').trim(), 'false');
      assert.equal(a.git('config', '--get', 'gc.auto').trim(), '0');
      assert.equal(a.git('log', '-1', '--format=%an <%ae>').trim(), 'Runes Test <test@example.com>');
      assert.equal(a.git('rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main');
      assert.equal(a.git('rev-parse', 'HEAD'), b.git('rev-parse', 'HEAD'), 'a fixed identity and date give the same commit');
      assert.equal(execFileSync('git', ['config', '--global', '--list'], { env: a.env, cwd: a.dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString(), '', 'no user config');
      a.write('c.txt', 'three\n');
      assert.match(a.commit('second'), /^[0-9a-f]{40}$/);
      assert.equal(a.git('rev-list', '--count', 'HEAD').trim(), '2');
    } finally { a.cleanup(); b.cleanup(); }
    assert.equal(existsSync(a.dir), false);
  });
});

describe('parity', () => {
  const tools = buildTools(TABLE, { help: USAGE });

  test('the demo table, its usage text and its tools agree', () => {
    assert.deepEqual(parityProblems({ table: TABLE, usage: USAGE, tools, toolOptions: { help: USAGE } }), []);
    assertParity({ table: TABLE, usage: USAGE, tools, toolOptions: { help: USAGE } });
  });

  test('a tool missing, a field missing or extra, a stray tool, and a missing help tool are named', () => {
    const t = structuredClone(tools).filter((x) => x.name !== 'demo_check');
    delete t.find((x) => x.name === 'demo_echo').inputSchema.properties.upper;
    t.find((x) => x.name === 'demo_note').inputSchema.properties.extra = { type: 'string' };
    t.push({ name: 'demo_ghost', inputSchema: { properties: {} } });
    const p = parityProblems({ table: TABLE, tools: t.filter((x) => x.name !== 'demo_help'), toolOptions: { help: USAGE } }).join('\n');
    for (const want of ['command "check" has no tool demo_check', 'tool demo_echo lacks "upper"', 'tool demo_note has "extra"', 'tool demo_ghost stands for no command', 'tool demo_help is expected but not listed']) assert.ok(p.includes(want), `${want}\n${p}`);
  });

  test('the usage side, both ways: a missing command, an unknown entry, a flag not mentioned, a flag not taken', () => {
    const usage = USAGE
      .replace(/^ {2}check .*\n/m, '')
      .replace('[--upper] ', '')
      .replace('  note                ', '  note [--loud]       ')
      .replace('options:', '  frob   not a command\n\noptions:');
    const p = parityProblems({ table: TABLE, usage }).join('\n');
    for (const want of ['command "check" is missing from the usage text', 'usage of "echo" does not mention --upper', 'usage of "note" mentions --loud, which it does not take']) assert.ok(p.includes(want), `${want}\n${p}`);
    const q = parityProblems({ table: TABLE, usage: USAGE.replace('commands:\n', 'commands:\n  bogus   x\n') }).join('\n');
    assert.match(q, /usage lists "bogus", which the table does not have/);
    assert.throws(() => assertParity({ table: TABLE, usage }), /disagree/);
    assert.deepEqual(parityProblems({ table: TABLE, usage: USAGE.replace('[--upper] ', ''), usageFlags: false }), []);
  });

  for (const mode of ['in-process', 'spawn']) {
    test(`the tools a running server lists (${mode}) agree with the table and the usage`, async () => {
      const listed = await listToolsOverStdio({ command: process.execPath, args: [SERVER, mode] });
      assertParity({ table: TABLE, usage: USAGE, tools: listed, toolOptions: { help: USAGE } });
    });
  }
});

describe('tools/list measurement', () => {
  test('size, estimate, per-tool order, and a warning only over budget', () => {
    const tools = buildTools(TABLE, { help: USAGE });
    const m = measureTools(tools);
    assert.equal(m.chars, JSON.stringify({ tools }).length);
    assert.equal(m.tokens, Math.ceil(m.chars / 4));
    assert.equal(m.over, false);
    assert.equal(m.warning, null);
    assert.equal(m.perTool.length, tools.length);
    assert.ok(m.perTool[0].chars >= m.perTool.at(-1).chars);
    assert.match(formatToolsMeasure(m, 'demo'), /^demo: ≈\d+ tokens for 10 tools \(\d+ chars\), within the budget of 8500$/);
    const tight = measureTools(tools, { budgetTokens: 10, label: 'demo' });
    assert.equal(tight.over, true);
    assert.match(tight.warning, /^demo: ≈\d+ tokens for 10 tools, over the budget of 10 \(largest: demo_\w+ ≈\d+/);
    assert.equal(formatToolsMeasure(tight), tight.warning);
  });
});

describe('stdio client', () => {
  test('requests, notifications, raw lines and every message kept; a request with no answer times out', async () => {
    const c = startMcpClient({ command: process.execPath, args: [SERVER, 'in-process'], timeoutMs: 1500 });
    try {
      assert.equal((await c.request('initialize', {})).result.serverInfo.name, 'demo');
      c.notify('notifications/initialized');
      c.raw('not json');
      assert.equal((await c.call('demo_echo', { text: 'hi', root: '/' })).result.content[0].text, 'hi');
      assert.ok(c.seen.some((m) => m.error?.code === -32700), 'the parse error came back');
      c.raw({ jsonrpc: '2.0', id: 'x', method: 'tools/call', params: { name: 'demo_sleep', arguments: { ms: '100', root: '/' } } });
      c.notify('notifications/cancelled', { requestId: 'x' });
      await assert.rejects(c.request('tools/call', { name: 'demo_sleep', arguments: { ms: '5000', root: '/' } }, 'late'), /no answer to tools\/call/);
    } finally { c.stop(); }
    assert.ok((await c.exited).signal !== undefined);
  });
});

describe('runtime pin', () => {
  const manifest = { runtime: { package: 'web-tree-sitter', version: '0.27.0' } };
  test('an exact match passes; a range, another version, an undeclared one or a different install is named', () => {
    assert.deepEqual(runtimePinProblems({ manifest, packageJson: { dependencies: { 'web-tree-sitter': '0.27.0' } }, installed: '0.27.0' }), []);
    assert.match(runtimePinProblems({ manifest, packageJson: { dependencies: { 'web-tree-sitter': '^0.27.0' } } })[0], /dependencies.web-tree-sitter is "\^0.27.0"; the grammar manifest pins exactly "0.27.0"/);
    assert.match(runtimePinProblems({ manifest, packageJson: { devDependencies: { 'web-tree-sitter': '0.25.0' } } })[0], /devDependencies/);
    assert.match(runtimePinProblems({ manifest, packageJson: {} })[0], /does not declare web-tree-sitter/);
    assert.match(runtimePinProblems({ manifest, installed: '0.26.1' })[0], /0.26.1 is installed/);
  });
});
