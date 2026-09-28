import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir, constants as osConstants } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { buildTools, argvFor, answersJson, commandForTool, toolName, createServer, serveStdio, spawnCli, killTree, InvalidParams, PROTOCOL_VERSION, PROTOCOL_VERSIONS } from '@chrisdudek/runes/mcp';
import { inProcess, runProcess } from './helpers/internal/mcp.mjs';
import { startMcpClient } from '@chrisdudek/runes/testkit';
import { TABLE, USAGE, dispatch } from './fixtures/demo-tool.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, 'fixtures', 'demo-mcp.mjs');
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'runes-mcp-')));
after(() => rmSync(tmp, { recursive: true, force: true }));

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
const until = async (cond, ms = 30_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 25)); } return cond(); };

// The test kit's stdio client, on the demo server with the executor named by mode.
const start = (mode, env = {}) => startMcpClient({ command: process.execPath, args: [SERVER, mode], env: { ...process.env, ...env } });
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
    assert.equal(e.additionalProperties, undefined, 'the server refuses an unknown field itself; the keyword would only cost tools/list bytes');
    assert.equal(e.properties.more.type, 'array');
    assert.equal(e.properties.more.minItems, undefined);
    assert.deepEqual(e.properties.times.type, ['number', 'string']);
    assert.equal(e.properties.tag.type, 'array');
    assert.match(e.properties.root.description, /absolute path/);
    assert.match(by.demo_write.inputSchema.properties.file.description, /absolute path/);
    assert.match(by.demo_export.inputSchema.properties.out.description, /absolute path/);
    // A field says only what its name and type cannot: a path field that it is absolute, nothing else. The json flag, the other flags and the arguments carry no description of their own (the help tool has the usage).
    for (const f of ['text', 'more', 'json', 'upper', 'times', 'tag']) assert.equal(e.properties[f].description, undefined, f);
    assert.equal(e.properties.root.description, 'An absolute path.');
    const noted = buildTools(TABLE, { fieldNote: (c, f) => (f === 'root' ? 'The checkout.' : undefined) });
    assert.equal(noted[0].inputSchema.properties.root.description, 'An absolute path. The checkout.');
    assert.equal(noted[0].inputSchema.properties.text.description, undefined);
  });

  test('annotations from writes, destructive and idempotent; descriptions start with the effect', () => {
    // Only what differs from the specification's defaults (readOnlyHint false, destructiveHint true, idempotentHint false, openWorldHint true).
    assert.deepEqual(by.demo_echo.annotations, { readOnlyHint: true, openWorldHint: false });
    assert.deepEqual(by.demo_store_rm.annotations, { openWorldHint: false });
    assert.deepEqual(by.demo_write.annotations, { destructiveHint: false, openWorldHint: false });
    assert.deepEqual(by.demo_help.annotations, { readOnlyHint: true, openWorldHint: false });
    const idem = buildTools({ tool: 'x', commands: { put: { writes: true, idempotent: true }, add: { writes: true, idempotent: false } } });
    assert.deepEqual(idem.map((t) => t.annotations), [{ destructiveHint: false, idempotentHint: true, openWorldHint: false }, { destructiveHint: false, openWorldHint: false }]);
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

describe('closed input without additionalProperties in the schema', () => {
  // tools/list no longer says additionalProperties: false, so the server alone keeps a tool's input closed. Every tool, the help tool included, refuses a field it does not list with -32602, and the call reaches neither prepare nor the executor.
  const minimal = (tool) => Object.fromEntries((tool.inputSchema.required ?? []).map((f) => [f, tool.inputSchema.properties[f].type === 'array' ? ['a'] : join(tmp, 'f')]));

  test('in process: an unknown field on any tool is -32602, and nothing is prepared or run', async () => {
    let prepared = 0; let ran = 0;
    const server = createServer({ table: TABLE, version: '1', tools: { help: USAGE }, prepare: () => { prepared += 1; }, executor: inProcess(() => { ran += 1; return { text: 'ran' }; }) });
    assert.equal(server.tools.some((t) => 'additionalProperties' in t.inputSchema), false);
    for (const tool of server.tools) {
      // Built as JSON text, as a client sends it, so "__proto__" is an own field and not the object's prototype.
      for (const extra of ['"zz": 1', '"zz": null', '"constructor": "x"', '"__proto__": 1', '"__proto__": {"text": "y"}']) {
        const base = JSON.stringify(minimal(tool)).slice(1, -1);
        const input = JSON.parse(`{${base}${base ? ',' : ''}${extra}}`);
        const r = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool.name, arguments: input } });
        assert.equal(r.error?.code, -32602, `${tool.name} ${JSON.stringify(Object.keys(input))}`);
        assert.match(r.error.message, /unknown field/);
      }
    }
    assert.equal(prepared, 0);
    assert.equal(ran, 0);
    // The same inputs without the extra field go through.
    assert.equal((await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'demo_help', arguments: {} } })).result.isError, false);
    assert.equal((await server.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'demo_echo', arguments: { text: 'x' } } })).result.isError, false);
    assert.equal(ran, 1);
  });

  test('spawn: an unknown field never starts the CLI', async () => {
    const mark = join(tmp, 'spawn-ran');
    const server = createServer({ table: TABLE, version: '1', executor: spawnCli({ args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(mark)}, 'ran')`] }) });
    const bad = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'demo_echo', arguments: { text: 'x', zz: true } } });
    assert.equal(bad.error.code, -32602);
    assert.equal(existsSync(mark), false, 'the CLI did not run');
    const ok = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'demo_echo', arguments: { text: 'x' } } });
    assert.equal(ok.result.isError, false);
    assert.equal(existsSync(mark), true, 'the same call without the field runs');
  });
});

describe('annotations mean what they meant in 0.1.x', () => {
  // 0.1.x wrote all four hints; 1.0.0 writes only those that differ from the MCP defaults. Read with the specification's defaults (readOnlyHint false, destructiveHint true, idempotentHint false, openWorldHint true; destructive and idempotent meaningful only when readOnlyHint is false), every table spec gives the same meaning both ways.
  const DEFAULTS = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
  const meaning = (a) => {
    const m = { ...DEFAULTS, ...a };
    return m.readOnlyHint ? { readOnly: true, openWorld: m.openWorldHint } : { readOnly: false, destructive: m.destructiveHint, idempotent: m.idempotentHint, openWorld: m.openWorldHint };
  };
  const old = (spec) => ({ readOnlyHint: !spec.writes, destructiveHint: !!spec.destructive, idempotentHint: spec.idempotent ?? !spec.writes, openWorldHint: false });

  test('every combination of writes, destructive and idempotent that defineTable accepts', () => {
    const specs = [{}, { writes: false }];
    for (const destructive of [undefined, false, true]) for (const idempotent of [undefined, false, true]) specs.push({ writes: true, ...(destructive === undefined ? {} : { destructive }), ...(idempotent === undefined ? {} : { idempotent }) });
    const commands = Object.fromEntries(specs.map((s, i) => [`c${i}`, s]));
    const tools = buildTools({ tool: 'x', commands }, { help: 'usage' });
    for (const [i, spec] of specs.entries()) assert.deepEqual(meaning(tools[i].annotations), meaning(old(spec)), JSON.stringify(spec));
    assert.deepEqual(meaning(tools.at(-1).annotations), meaning({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }), 'the help tool');
  });
});

describe('consumer hooks and JSON refusals without error documents', () => {
  const run = inProcess(({ parsed }) => dispatch(parsed.command, parsed.args, parsed.flags));

  test('errorDocuments: false answers a JSON refusal with the message as the one block; notes stay in _meta', async () => {
    const server = createServer({ table: TABLE, version: '0', executor: run, errorDocuments: false, prepare: () => ({ notes: { loop: 'reached /somewhere' } }) });
    const r = await server.callTool('demo_fail', { why: 'no', json: true });
    assert.equal(r.isError, true);
    assert.deepEqual(r.content, [{ type: 'text', text: 'refused: no' }]);
    assert.deepEqual(r._meta, { 'demo/loop': 'reached /somewhere' });
    const ok = await server.callTool('demo_note', { json: true });
    assert.equal(ok.content.length, 1);
    assert.deepEqual(ok._meta, { 'demo/notes': 'note: careful', 'demo/loop': 'reached /somewhere' });
    const t = await server.callTool('demo_fail', { why: 'no' });
    assert.deepEqual(t.content.map((c) => c.text), ['refused: no', 'reached /somewhere'], 'text mode keeps notes as blocks');
  });

  test('transformInput resolves a repository-relative path, validates a bare-name field, and translates; transformArgv rewrites the argv', async () => {
    const repo = tmp;
    const seen = [];
    const server = createServer({
      table: TABLE, version: '0', executor: inProcess(({ parsed, argv }) => { seen.push(argv); return dispatch(parsed.command, parsed.args, parsed.flags); }),
      transformInput: ({ command, input }) => {
        if (command === 'write' && typeof input.file === 'string') {
          if (input.file.startsWith('/container/')) input.file = join(repo, input.file.slice('/container/'.length));
          else if (!isAbsolute(input.file)) input.file = join(repo, input.file);
        }
        if (command === 'echo' && typeof input.text === 'string' && /[\\/]/.test(input.text) && !isAbsolute(input.text)) throw new InvalidParams('demo_echo: "text" must be a bare name or an absolute path');
        return input;
      },
      transformArgv: ({ command, argv }) => (command === 'echo' ? ['echo', '--upper', ...argv.slice(1)] : argv),
    });
    await server.callTool('demo_write', { file: 'rel.txt', content: 'r' });
    assert.equal(readFileSync(join(repo, 'rel.txt'), 'utf8'), 'r');
    await server.callTool('demo_write', { file: '/container/cont.txt', content: 'c' });
    assert.equal(readFileSync(join(repo, 'cont.txt'), 'utf8'), 'c');
    assert.equal((await server.callTool('demo_echo', { text: 'shout' })).content[0].text, 'SHOUT');
    assert.deepEqual(seen.at(-1), ['echo', '--upper', '--', 'shout']);
    await assert.rejects(server.callTool('demo_echo', { text: 'a/b' }), (e) => e instanceof InvalidParams && /bare name/.test(e.message));
    const rpc = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'demo_echo', arguments: { text: 'a/b' } } });
    assert.equal(rpc.error.code, -32602);
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
      } finally { await s.stop(); }
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
      } finally { await s.stop(); }
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
      } finally { await s.stop(); }
    });

    test('ping and tools/list are answered while a call runs, never queued behind it; client responses are ignored', async () => {
      const s = start(mode);
      try {
        await s.request('initialize', {});
        const slow = s.call('demo_sleep', { ms: '4000', root: tmp }, 'slow');
        await new Promise((r) => setTimeout(r, 100));
        s.raw({ jsonrpc: '2.0', id: 99, result: { whatever: true } });
        const ping = await s.request('ping', undefined, 'p');
        assert.deepEqual(ping.result, {});
        assert.ok((await s.request('tools/list', undefined, 'l')).result.tools.length > 0);
        assert.equal(textOf(await slow), 'slept 4000');
        // Order on the wire, not the clock: the call was sent first, so a queued ping would be answered after it.
        const at = (id) => s.seen.findIndex((m) => m.id === id);
        assert.ok(at('p') < at('slow') && at('l') < at('slow'), `ping and tools/list answered before the running call: ${JSON.stringify(s.seen.map((m) => m.id))}`);
        assert.ok(!s.seen.some((m) => m.id === 99), 'nothing answers a client response');
      } finally { await s.stop(); }
    });

    test('calls run one at a time, in order', async () => {
      const s = start(mode);
      try {
        const order = [];
        const a = s.call('demo_sleep', { ms: '400', root: tmp }).then(() => order.push('a'));
        const b = s.call('demo_echo', { text: 'b', root: tmp }).then(() => order.push('b'));
        await Promise.all([a, b]);
        assert.deepEqual(order, ['a', 'b']);
      } finally { await s.stop(); }
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
      } finally { await s.stop(); }
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
    } finally { await s.stop(); }
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
    } finally { await s.stop(); }
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
      } finally { await s.stop(); }
    });
  }
});

describe('an in-process run past its timeout', () => {
  test('one that honours the signal is stopped and answered as a timeout', async () => {
    const s = start('in-process', { DEMO_TIMEOUT_MS: '200' });
    try {
      await s.request('initialize', {});
      const t0 = Date.now();
      const r = await s.call('demo_sleep', { ms: '5000', root: tmp });
      assert.match(textOf(r), /demo sleep did not finish within 200 ms and was stopped/);
      assert.ok(Date.now() - t0 < 4000);
    } finally { await s.stop(); }
  });

  test('one that ignores it: the answer is a timeout, and the next call waits until the run has ended', async () => {
    const s = start('in-process', { DEMO_TIMEOUT_MS: '200' });
    try {
      await s.request('initialize', {});
      const t0 = Date.now();
      const first = s.call('demo_sleep', { ms: '3000', stubborn: true, root: tmp });
      const second = s.call('demo_echo', { text: 'after', root: tmp });
      assert.match(textOf(await first), /did not finish within 200 ms/);
      const answered = Date.now() - t0;
      assert.ok(answered < 2500, `the timeout answered before the run ended (${answered} ms)`);
      assert.equal(textOf(await second), 'after');
      assert.ok(Date.now() - t0 >= 2900, `the next call waited for the run to end (${Date.now() - t0} ms)`);
    } finally { await s.stop(); }
  });
});

describe('several calls at once', () => {
  // serveStdio over streams and a server whose calls finish when the test says so: the scheduling alone, with no process and no clock.
  const harness = (concurrency) => {
    const input = new PassThrough();
    const output = new PassThrough();
    const sent = [];
    createInterface({ input: output }).on('line', (l) => sent.push(JSON.parse(l)));
    const calls = new Map();   // id → { name, finish(), signal }
    const started = [];
    const server = {
      tools: [],
      idle: async () => {},
      callTool: async () => { throw new Error('unused'); },
      handle: (msg, signal) => new Promise((res) => {
        started.push(msg.id);
        calls.set(msg.id, { name: msg.params.name, signal, finish: () => res({ jsonrpc: '2.0', id: msg.id, result: { done: msg.id } }) });
        signal.addEventListener('abort', () => res(null), { once: true });
      }),
      ...(concurrency ? { concurrency } : {}),
    };
    const handle = serveStdio(server, { input, output, signals: false, exit: () => {} });
    const send = (id, name) => input.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: {} } })}\n`);
    const cancel = (id) => input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id } })}\n`);
    const tick = () => new Promise((r) => setImmediate(r));
    return { send, cancel, calls, started, sent, tick, close: () => { handle.close(); } };
  };
  const limits = (total, per = {}) => ({ total, perTool: (name) => ({ key: name, limit: per[name] ?? Infinity }) });

  test('without concurrency a server runs one call at a time, in order', async () => {
    const h = harness();
    try {
      h.send(1, 'a'); h.send(2, 'b'); h.send(3, 'a');
      await h.tick();
      assert.deepEqual(h.started, [1]);
      h.calls.get(1).finish(); await h.tick(); await h.tick();
      assert.deepEqual(h.started, [1, 2]);
      h.calls.get(2).finish(); await h.tick(); await h.tick();
      assert.deepEqual(h.started, [1, 2, 3]);
    } finally { h.close(); }
  });

  test('total bounds the calls running together; the rest wait in arrival order; answers go out as calls finish', async () => {
    const h = harness(limits(2));
    try {
      for (const id of [1, 2, 3, 4]) h.send(id, `t${id}`);
      await h.tick();
      assert.deepEqual(h.started, [1, 2]);
      h.calls.get(2).finish(); await h.tick(); await h.tick();
      assert.deepEqual(h.started, [1, 2, 3], 'the oldest waiting call takes the free place');
      assert.deepEqual(h.sent.map((m) => m.id), [2], 'the call that finished first is answered first');
      h.calls.get(1).finish(); h.calls.get(3).finish(); await h.tick(); await h.tick();
      assert.deepEqual(h.started, [1, 2, 3, 4]);
      h.calls.get(4).finish(); await h.tick();
      assert.deepEqual(h.sent.map((m) => m.id).sort(), [1, 2, 3, 4]);
    } finally { h.close(); }
  });

  test('perCommand holds back calls of one command without holding back the others', async () => {
    const h = harness(limits(Infinity, { w: 1 }));
    try {
      h.send(1, 'w'); h.send(2, 'w'); h.send(3, 'r'); h.send(4, 'r');
      await h.tick();
      assert.deepEqual(h.started, [1, 3, 4], 'the second w waits for the first; the reads behind it do not');
      h.calls.get(1).finish(); await h.tick(); await h.tick();
      assert.deepEqual(h.started, [1, 3, 4, 2]);
    } finally { h.close(); }
  });

  test('a cancel stops only its own call, running or waiting, and frees its place', async () => {
    const h = harness(limits(2));
    try {
      h.send('a', 'x'); h.send('b', 'x'); h.send('c', 'x'); h.send('d', 'x');
      await h.tick();
      h.cancel('c');   // waiting: dropped without an answer
      h.cancel('a');   // running: aborted, no answer, its place goes to d
      await h.tick(); await h.tick();
      assert.equal(h.calls.get('a').signal.aborted, true);
      assert.equal(h.calls.get('b').signal.aborted, false);
      assert.deepEqual(h.started, ['a', 'b', 'd']);
      h.calls.get('b').finish(); h.calls.get('d').finish(); await h.tick();
      assert.deepEqual(h.sent.map((m) => m.id).sort(), ['b', 'd']);
    } finally { h.close(); }
  });

  test('createServer checks the limits and refuses concurrency with an in-process executor', () => {
    const base = { table: TABLE, version: '1', executor: spawnCli({ args: ['x'] }) };
    assert.throws(() => createServer({ ...base, concurrency: { total: 0 } }), /concurrency.total/);
    assert.throws(() => createServer({ ...base, concurrency: { total: 1.5 } }), /concurrency.total/);
    assert.throws(() => createServer({ ...base, concurrency: { perCommand: -1 } }), /concurrency.perCommand/);
    assert.throws(() => createServer({ ...base, executor: inProcess(() => ({})), concurrency: { total: 2 } }), /spawn executor/);
    assert.equal(createServer({ ...base, executor: inProcess(() => ({})), concurrency: { total: 1 } }).concurrency.total, 1);
    const s = createServer({ ...base, concurrency: { total: Infinity, perCommand: (c) => (c === 'store rm' ? 1 : c === 'echo' ? 'x' : c === 'fail' ? (() => { throw new Error('no'); })() : 3) } });
    assert.deepEqual(s.concurrency.perTool('demo_store_rm'), { key: 'store rm', limit: 1 });
    assert.deepEqual(s.concurrency.perTool('demo_write'), { key: 'write', limit: 3 });
    assert.deepEqual(s.concurrency.perTool('demo_echo'), { key: 'echo', limit: 1 }, 'an answer that is no limit counts as 1');
    assert.deepEqual(s.concurrency.perTool('demo_fail'), { key: 'fail', limit: 1 }, 'a function that throws counts as 1');
    assert.deepEqual(s.concurrency.perTool('demo_help'), { key: '', limit: Infinity });
    assert.equal(createServer(base).concurrency.total, 1, 'one at a time unless asked');
    assert.deepEqual(createServer(base).concurrency.perTool('demo_echo'), { key: 'echo', limit: Infinity });
  });

  test('spawned CLIs run side by side, each with its own time limit counted from its start', async () => {
    const s = start('spawn', { DEMO_CONCURRENCY: JSON.stringify({ total: 3, perCommand: { sleep: 2 } }), DEMO_TIMEOUT_MS: '4000' });
    try {
      await s.request('initialize', {});
      const t0 = Date.now();
      const slow = [s.call('demo_sleep', { ms: '2500', root: tmp }, 's1'), s.call('demo_sleep', { ms: '2500', root: tmp }, 's2')];
      const third = s.call('demo_sleep', { ms: '2500', root: tmp }, 's3');   // waits for a sleep place: perCommand 2
      const echo = await s.call('demo_echo', { text: 'quick', root: tmp }, 'e');
      assert.equal(textOf(echo), 'quick');
      for (const r of await Promise.all(slow)) assert.equal(textOf(r), 'slept 2500');
      const both = Date.now() - t0;
      // The third waited about 2.5 s and then slept 2.5 s: past 4 s from its arrival, within 4 s of its start.
      assert.equal(textOf(await third), 'slept 2500', 'the time limit counts from the start, not the arrival');
      assert.ok(both < 4990, `the first two slept side by side (${both} ms)`);
      const order = s.seen.map((m) => m.id).filter((id) => ['s1', 's2', 's3', 'e'].includes(id));
      assert.equal(order[0], 'e', `the quick call was answered first: ${order}`);
      assert.equal(order[3], 's3');
    } finally { await s.stop(); }
  });

  test('a spawned call past its limit is stopped alone; one cancelled is stopped alone', async () => {
    const pidFile = join(tmp, 'pids-parallel');
    const s = start('spawn', { DEMO_CONCURRENCY: JSON.stringify({ total: 4 }), DEMO_TIMEOUT_MS: '3000', DEMO_PIDS: pidFile });
    try {
      await s.request('initialize', {});
      const tree = s.call('demo_tree', { root: tmp }, 'tree');
      s.raw({ jsonrpc: '2.0', id: 'gone', method: 'tools/call', params: { name: 'demo_sleep', arguments: { ms: '2500', root: tmp } } });
      const kept = s.call('demo_sleep', { ms: '1000', root: tmp }, 'kept');
      await new Promise((r) => setTimeout(r, 300));
      s.raw({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'gone' } });
      assert.equal(textOf(await kept), 'slept 1000');
      const t = await tree;
      assert.equal(t.result.isError, true);
      assert.match(textOf(t), /demo tree did not finish within 3 s/);
      await new Promise((r) => setTimeout(r, 200));
      assert.ok(!s.seen.some((m) => m.id === 'gone'), 'the cancelled call got no answer');
      assert.deepEqual((await s.request('ping')).result, {});
    } finally { await s.stop(); }
  });
});
