import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, rmSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir, constants as osConstants } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTools, argvFor, answersJson, commandForTool, toolName, createServer, inProcess, killTree, runProcess, InvalidParams, PROTOCOL_VERSION, PROTOCOL_VERSIONS,
} from '@chrisdudek/runes/mcp';
import { TABLE, USAGE, dispatch } from './fixtures/demo-tool.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, 'fixtures', 'demo-mcp.mjs');
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'runes-mcp-')));
after(() => rmSync(tmp, { recursive: true, force: true }));

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
const until = async (cond, ms = 10_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 25)); } return cond(); };

// A minimal MCP client over a server's real stdio: requests correlated by id, every line seen kept.
function start(mode, env = {}) {
  const child = spawn(process.execPath, [SERVER, mode], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  const seen = [];
  let stderr = '';
  let next = 1;
  child.stderr.on('data', (d) => { stderr += d; });
  createInterface({ input: child.stdout }).on('line', (line) => {
    let m; try { m = JSON.parse(line); } catch { seen.push({ raw: line }); return; }
    seen.push(m);
    const k = JSON.stringify(m.id);
    if (pending.has(k)) { pending.get(k)(m); pending.delete(k); }
  });
  const raw = (obj) => child.stdin.write(`${typeof obj === 'string' ? obj : JSON.stringify(obj)}\n`);
  const request = (method, params, id = next++) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`no answer to ${method} — stderr:\n${stderr}`)), 20_000);
    pending.set(JSON.stringify(id), (m) => { clearTimeout(t); res(m); });
    raw({ jsonrpc: '2.0', id, method, params });
  });
  const call = (name, args, id) => request('tools/call', { name, arguments: args }, id);
  const exited = new Promise((r) => child.on('exit', (code, signal) => r({ code, signal })));
  const stop = () => { try { child.stdin.end(); } catch { /* closed */ } try { child.kill('SIGKILL'); } catch { /* gone */ } };
  return { child, request, call, raw, seen, exited, stop, stderr: () => stderr };
}
const textOf = (r) => r.result.content.map((c) => c.text).join('\n');

describe('tools from the table', () => {
  const tools = buildTools(TABLE, { help: USAGE });
  const by = Object.fromEntries(tools.map((t) => [t.name, t]));

  test('one tool per public command, subcommands joined with _, the help tool, no internal command', () => {
    assert.deepEqual(tools.map((t) => t.name), ['demo_echo', 'demo_fail', 'demo_check', 'demo_note', 'demo_write', 'demo_store_rm', 'demo_export', 'demo_sleep', 'demo_tree', 'demo_help']);
    assert.equal(commandForTool(TABLE, 'demo_store_rm'), 'store rm');
    assert.equal(commandForTool(TABLE, 'demo_hook'), null);
    assert.equal(commandForTool(TABLE, 'demo_help'), null);
    assert.equal(toolName('x_', 'a b-c'), 'x_a_b_c');
  });

  test('fields are the arguments, the flags and the global flags except help; required and minItems follow the table', () => {
    const e = by.demo_echo.inputSchema;
    assert.deepEqual(Object.keys(e.properties), ['text', 'more', 'json', 'root', 'upper', 'times', 'tag']);
    assert.deepEqual(e.required, ['text']);
    assert.equal(e.additionalProperties, false);
    assert.equal(e.properties.more.type, 'array');
    assert.equal(e.properties.more.minItems, undefined);
    assert.deepEqual(e.properties.times.type, ['number', 'string']);
    assert.equal(e.properties.tag.type, 'array');
    assert.match(e.properties.root.description, /absolute path/);
    assert.match(by.demo_write.inputSchema.properties.file.description, /absolute path/);
    assert.match(by.demo_export.inputSchema.properties.out.description, /absolute path/);
  });

  test('annotations from writes, destructive and idempotent; descriptions start with the effect', () => {
    assert.deepEqual(by.demo_echo.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    assert.deepEqual(by.demo_store_rm.annotations, { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false });
    assert.equal(by.demo_write.description, 'WRITES. Write a file.');
    assert.equal(by.demo_echo.description, 'Read-only. Say it back.');
    const custom = buildTools(TABLE, { prefix: 'd_', describe: (c) => `do ${c}`, fieldNote: (c, f) => (c === 'echo' && f === 'text' ? 'Say anything.' : undefined), omitFlags: [] });
    assert.equal(custom[0].name, 'd_echo');
    assert.equal(custom[0].description, 'do echo');
    assert.match(custom[0].inputSchema.properties.text.description, /Say anything\.$/);
    assert.ok('help' in custom[0].inputSchema.properties);
  });

  test('argvFor: flags inline, then --, then the arguments in order', () => {
    assert.deepEqual(argvFor(TABLE, 'echo', { text: '--hi', more: ['a', 'b'], upper: true, times: 2, tag: ['x', 'y'], json: false }), ['echo', '--upper', '--times=2', '--tag=x', '--tag=y', '--', '--hi', 'a', 'b']);
    assert.deepEqual(argvFor(TABLE, 'store rm', { id: 7 }), ['store', 'rm', '--', '7']);
    assert.deepEqual(argvFor(TABLE, 'check', undefined), ['check']);
    assert.deepEqual(argvFor(TABLE, 'echo', { text: 'x', tag: 'one' }), ['echo', '--tag=one', '--', 'x']);
  });

  test('argvFor refuses what does not fit, with InvalidParams naming the field', () => {
    const refuses = (cmd, input, re) => assert.throws(() => argvFor(TABLE, cmd, input), (e) => e instanceof InvalidParams && e.rpcCode === -32602 && re.test(e.message), JSON.stringify(input));
    refuses('echo', [], /arguments must be an object/);
    refuses('echo', { text: 'x', bogus: 1 }, /unknown field "bogus"/);
    refuses('echo', { text: 'x', help: true }, /unknown field "help"/);
    refuses('echo', {}, /"text" is required/);
    refuses('echo', { text: 'x', upper: 'yes' }, /"upper" must be true or false/);
    refuses('echo', { text: 'x', times: 'many' }, /"times" must be a number/);
    refuses('echo', { text: 'x', tag: [{}] }, /"tag" must be a string or a list/);
    refuses('echo', { text: { a: 1 } }, /"text" must be a string/);
    refuses('write', { file: 'rel/path' }, /"file" must be an absolute path/);
    refuses('write', { file: join(tmp, 'x'), root: 'rel' }, /"root" must be an absolute path/);
    refuses('write', { content: 'c' }, /"file" is required/);
  });

  test('answersJson: json: true, or a command that prints JSON unasked unless it writes to a file', () => {
    assert.equal(answersJson(TABLE, 'echo', { json: true }), true);
    assert.equal(answersJson(TABLE, 'echo', {}), false);
    assert.equal(answersJson(TABLE, 'export', {}), true);
    assert.equal(answersJson(TABLE, 'export', { out: '/x' }), false);
  });
});

describe('the protocol, without a transport', () => {
  const server = createServer({ table: TABLE, version: '9.9.9', executor: inProcess(({ parsed }) => dispatch(parsed.command, parsed.args, parsed.flags)), instructions: 'use the tools' });

  test('initialize negotiates the version: a known one comes back, any other gets the latest', async () => {
    for (const v of PROTOCOL_VERSIONS) assert.equal((await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: v } })).result.protocolVersion, v);
    const r = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    assert.equal(r.result.protocolVersion, PROTOCOL_VERSION);
    assert.deepEqual(r.result.serverInfo, { name: 'demo', version: '9.9.9' });
    assert.deepEqual(r.result.capabilities, { tools: {} });
    assert.equal(r.result.instructions, 'use the tools');
  });

  test('ping, tools/list, unknown methods, notifications, client responses, invalid requests', async () => {
    assert.deepEqual((await server.handle({ jsonrpc: '2.0', id: 'p', method: 'ping' })).result, {});
    assert.equal((await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).result.tools.length, 9);
    assert.equal((await server.handle({ jsonrpc: '2.0', id: 3, method: 'nope' })).error.code, -32601);
    assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
    assert.equal(await server.handle({ jsonrpc: '2.0', id: 4, result: {} }), null);
    assert.equal(await server.handle({ jsonrpc: '2.0', id: 5, error: { code: 1, message: 'x' } }), null);
    assert.equal((await server.handle({ jsonrpc: '2.0', id: 6 })).error.code, -32600);
    assert.equal((await server.handle([1])).error.code, -32600);
  });

  test('tools/call: an unknown tool and bad input are -32602; nothing runs', async () => {
    assert.equal((await server.handle({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'demo_nope', arguments: {} } })).error.code, -32602);
    const file = join(tmp, 'never');
    const r = await server.handle({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'demo_write', arguments: { file: 'never' } } });
    assert.equal(r.error.code, -32602);
    assert.equal(existsSync(file), false);
  });
});

describe('processes', () => {
  test('killTree on Windows runs taskkill /PID <pid> /T /F, and nothing for no pid', () => {
    const calls = [];
    killTree(4242, { platform: 'win32', spawnSync: (cmd, args, opts) => { calls.push([cmd, args, opts.windowsHide]); return { status: 0 }; } });
    killTree(undefined, { platform: 'win32', spawnSync: () => { calls.push('never'); return { status: 0 }; } });
    assert.deepEqual(calls, [['taskkill', ['/PID', '4242', '/T', '/F'], true]]);
  });

  test('runProcess collects output and the exit code; a program that does not exist is code 1 with the reason', async () => {
    const r = await runProcess(process.execPath, ['-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)']);
    assert.deepEqual([r.code, r.stdout, r.stderr, r.stopped], [3, 'out', 'err', false]);
    const missing = await runProcess(join(tmp, 'no-such-program'), []);
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /ENOENT/);
  });
});

for (const mode of ['in-process', 'spawn']) {
  describe(`over stdio, ${mode}`, () => {
    test('initialize, tools/list, and a call in text and in JSON: JSON is one block, notes go to _meta', async () => {
      const s = start(mode);
      try {
        const init = await s.request('initialize', { protocolVersion: '2025-03-26' });
        assert.equal(init.result.protocolVersion, '2025-03-26');
        assert.deepEqual(init.result.serverInfo, { name: 'demo', version: '1.2.3' });
        assert.equal((await s.request('tools/list')).result.tools.length, 10);

        const t = await s.call('demo_echo', { text: 'hi', upper: true, root: tmp });
        assert.deepEqual(t.result, { content: [{ type: 'text', text: 'HI' }], isError: false });

        const j = await s.call('demo_echo', { text: 'hi', times: 2, json: true });
        assert.equal(j.result.content.length, 1, 'one block');
        assert.deepEqual(JSON.parse(j.result.content[0].text), { text: 'hi hi', tags: [] });
        assert.deepEqual(j.result._meta, { 'demo/where': 'no root given (echo)' });

        const n = await s.call('demo_note', { json: true, root: tmp });
        assert.equal(n.result.content.length, 1);
        assert.match(n.result._meta[mode === 'spawn' ? 'demo/stderr' : 'demo/notes'], /note: careful/);
        const nt = await s.call('demo_note', {});
        assert.deepEqual(nt.result.content.map((c) => c.text), ['ok', 'note: careful', 'no root given (note)']);

        const e = await s.call('demo_export', { root: tmp });
        assert.equal(e.result.content.length, 1);
        assert.equal(JSON.parse(e.result.content[0].text).schema, 'demo-export/1');

        const h = await s.call('demo_help', {});
        assert.equal(textOf(h), USAGE);
      } finally { s.stop(); }
    });

    test('a refusal is isError: the <tool>-error/1 document as the one block in JSON, the message in text', async () => {
      const s = start(mode);
      try {
        const j = await s.call('demo_fail', { why: 'no', json: true, root: tmp });
        assert.equal(j.result.isError, true);
        assert.equal(j.result.content.length, 1);
        assert.deepEqual(JSON.parse(j.result.content[0].text), { schema: 'demo-error/1', code: 'refused', what: 'refused: no', why: 'the test asked for it', next: { command: ['demo', 'echo', 'ok'], text: 'demo echo ok' } });
        const t = await s.call('demo_fail', { why: 'no', root: tmp });
        assert.equal(t.result.isError, true);
        assert.match(t.result.content[0].text, /refused: no/);
        const c = await s.call('demo_check', { json: true, root: tmp });
        assert.equal(c.result.isError, true, 'a non-zero exit is isError');
        assert.deepEqual(JSON.parse(c.result.content[0].text), { ok: false });
      } finally { s.stop(); }
    });

    test('input that does not fit is -32602 and writes nothing; a write with an absolute path goes through', async () => {
      const s = start(mode);
      try {
        const rel = await s.call('demo_write', { file: 'relative.txt', root: tmp });
        assert.equal(rel.error.code, -32602);
        assert.match(rel.error.message, /absolute path/);
        assert.equal((await s.call('demo_write', { file: join(tmp, 'x'), bogus: 1 })).error.code, -32602);
        assert.equal((await s.call('demo_nope', {})).error.code, -32602);
        const file = join(tmp, `${mode}.txt`);
        const ok = await s.call('demo_write', { file, content: 'hello', root: tmp });
        assert.equal(ok.result.isError, false);
        assert.equal(readFileSync(file, 'utf8'), 'hello');
      } finally { s.stop(); }
    });

    test('ping and tools/list are answered while a call runs, never queued behind it; client responses are ignored', async () => {
      const s = start(mode);
      try {
        await s.request('initialize', {});
        const slow = s.call('demo_sleep', { ms: '1500', root: tmp }, 'slow');
        await new Promise((r) => setTimeout(r, 100));
        s.raw({ jsonrpc: '2.0', id: 99, result: { whatever: true } });
        const t0 = Date.now();
        assert.deepEqual((await s.request('ping')).result, {});
        assert.ok((await s.request('tools/list')).result.tools.length > 0);
        assert.ok(Date.now() - t0 < 1000, 'answered before the call ended');
        assert.equal(textOf(await slow), 'slept 1500');
        assert.ok(!s.seen.some((m) => m.id === 99), 'nothing answers a client response');
      } finally { s.stop(); }
    });

    test('calls run one at a time, in order', async () => {
      const s = start(mode);
      try {
        const order = [];
        const a = s.call('demo_sleep', { ms: '400', root: tmp }).then(() => order.push('a'));
        const b = s.call('demo_echo', { text: 'b', root: tmp }).then(() => order.push('b'));
        await Promise.all([a, b]);
        assert.deepEqual(order, ['a', 'b']);
      } finally { s.stop(); }
    });

    test('a cancelled call gets no answer; a cancel for an unknown id is ignored and a reused id is answered', async () => {
      const s = start(mode);
      try {
        await s.request('initialize', {});
        s.raw({ jsonrpc: '2.0', id: 'c1', method: 'tools/call', params: { name: 'demo_sleep', arguments: { ms: '5000', root: tmp } } });
        s.raw({ jsonrpc: '2.0', id: 'c2', method: 'tools/call', params: { name: 'demo_echo', arguments: { text: 'queued', root: tmp } } });
        await new Promise((r) => setTimeout(r, 200));
        s.raw({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'c2' } });
        s.raw({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'c1' } });
        s.raw({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'never-sent' } });
        const again = await s.call('demo_echo', { text: 'again', root: tmp }, 'c2');
        assert.equal(textOf(again), 'again');
        await new Promise((r) => setTimeout(r, 100));
        assert.ok(!s.seen.some((m) => m.id === 'c1'), 'the running call cancelled: no answer');
        assert.equal(s.seen.filter((m) => m.id === 'c2').length, 1, 'the queued call dropped, the reused id answered once');
        // A late cancel for a call already answered is ignored: a later request reusing the id is answered.
        assert.equal(textOf(await s.call('demo_echo', { text: 'first', root: tmp }, 'd1')), 'first');
        s.raw({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'd1' } });
        assert.equal(textOf(await s.call('demo_echo', { text: 'second', root: tmp }, 'd1')), 'second');
      } finally { s.stop(); }
    });
  });
}

describe('stopping a spawned CLI with its tree', () => {
  const pidsOf = async (file) => { await until(() => existsSync(file) && readFileSync(file, 'utf8').includes(' ')); return readFileSync(file, 'utf8').split(' ').map(Number); };

  test('past its timeout: the tree is killed, the answer is isError with the hint, and the server keeps answering', async () => {
    const pidFile = join(tmp, 'pids-timeout');
    const s = start('spawn', { DEMO_TIMEOUT_MS: '6000', DEMO_PIDS: pidFile });
    try {
      const r = s.call('demo_tree', { root: tmp });
      const pids = await pidsOf(pidFile);
      assert.ok(pids.every(alive), 'the CLI and its child run');
      const res = await r;
      assert.equal(res.result.isError, true);
      assert.match(textOf(res), /demo tree did not finish within 6 s and was stopped\. Set DEMO_TIMEOUT_MS/);
      assert.ok(await until(() => !pids.some(alive)), `the CLI and its child are gone: ${pids.filter(alive)}`);
      assert.deepEqual((await s.request('ping')).result, {});
    } finally { s.stop(); }
  });

  test('cancelled: the tree is killed and the call gets no answer', async () => {
    const pidFile = join(tmp, 'pids-cancel');
    const s = start('spawn', { DEMO_PIDS: pidFile });
    try {
      s.raw({ jsonrpc: '2.0', id: 'k', method: 'tools/call', params: { name: 'demo_tree', arguments: { root: tmp } } });
      const pids = await pidsOf(pidFile);
      s.raw({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'k' } });
      assert.ok(await until(() => !pids.some(alive)), 'the CLI and its child are gone');
      assert.deepEqual((await s.request('ping')).result, {});
      assert.ok(!s.seen.some((m) => m.id === 'k'));
    } finally { s.stop(); }
  });

  test('the client closes stdin: the tree is killed and the server exits 0', async () => {
    const pidFile = join(tmp, 'pids-close');
    const s = start('spawn', { DEMO_PIDS: pidFile });
    s.raw({ jsonrpc: '2.0', id: 'x', method: 'tools/call', params: { name: 'demo_tree', arguments: { root: tmp } } });
    const pids = await pidsOf(pidFile);
    s.child.stdin.end();
    assert.deepEqual(await s.exited, { code: 0, signal: null });
    assert.ok(await until(() => !pids.some(alive)), 'the CLI and its child are gone');
  });

  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    test(`${sig} to the server: the tree is killed and the server exits with 128 + the signal number`, { skip: process.platform === 'win32' && 'Windows delivers no POSIX signals to a child' }, async () => {
      const pidFile = join(tmp, `pids-${sig}`);
      const s = start('spawn', { DEMO_PIDS: pidFile });
      try {
        s.raw({ jsonrpc: '2.0', id: 'x', method: 'tools/call', params: { name: 'demo_tree', arguments: { root: tmp } } });
        const pids = await pidsOf(pidFile);
        s.child.kill(sig);
        const how = await s.exited;
        assert.deepEqual(how, { code: 128 + osConstants.signals[sig], signal: null }, 'handled, not the default action');
        assert.ok(await until(() => !pids.some(alive)), `the CLI and its child are gone: ${pids.filter(alive)}`);
      } finally { s.stop(); }
    });
  }
});

describe('an in-process run past its timeout', () => {
  test('one that honours the signal is stopped and answered as a timeout', async () => {
    const s = start('in-process', { DEMO_TIMEOUT_MS: '200' });
    try {
      const t0 = Date.now();
      const r = await s.call('demo_sleep', { ms: '5000', root: tmp });
      assert.match(textOf(r), /demo sleep did not finish within 200 ms and was stopped/);
      assert.ok(Date.now() - t0 < 2000);
    } finally { s.stop(); }
  });

  test('one that ignores it: the answer is a timeout, and the next call waits until the run has ended', async () => {
    const s = start('in-process', { DEMO_TIMEOUT_MS: '200' });
    try {
      const t0 = Date.now();
      const first = s.call('demo_sleep', { ms: '1200', stubborn: true, root: tmp });
      const second = s.call('demo_echo', { text: 'after', root: tmp });
      assert.match(textOf(await first), /did not finish within 200 ms/);
      assert.ok(Date.now() - t0 < 1000, 'the timeout answered at once');
      assert.equal(textOf(await second), 'after');
      assert.ok(Date.now() - t0 >= 1100, `the next call waited for the run to end (${Date.now() - t0} ms)`);
    } finally { s.stop(); }
  });
});
