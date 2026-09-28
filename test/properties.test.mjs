// Property tests: the contracts that hold for every input, checked on many generated ones rather than a few chosen by hand. The seed of each run is printed with any failure (see helpers/prng.mjs).
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, utimesSync, realpathSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTable, parseArgs, UsageError } from '@chrisdudek/runes/cli';
import { argvFor, buildTools } from '@chrisdudek/runes/mcp';
import { withLock, withLockAsync, LockHeldError } from '@chrisdudek/runes/fs';
import { random, seedNote } from './helpers/prng.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'runes-props-')));
after(() => rmSync(tmp, { recursive: true, force: true }));
const ABS = process.platform === 'win32' ? 'C:\\abs\\' : '/abs/';

// A random well-formed command table: global flags, commands with subcommands, arguments in every allowed shape, flags of every kind.
function randomTable(r) {
  const KINDS = ['bool', 'value', 'many', 'number', 'path'];
  const globalFlags = {};
  for (let i = r.int(0, 2); i > 0; i -= 1) globalFlags[`g${r.name()}`] = r.pick(KINDS);
  const commands = {};
  for (let c = r.int(1, 4); c > 0; c -= 1) {
    const key = r.bool(0.3) ? `${r.name()} ${r.name()}` : r.name();
    const args = [];
    const req = r.int(0, 2);
    const opt = r.int(0, 2);
    for (let i = 0; i < req; i += 1) args.push(`r${i}`);
    for (let i = 0; i < opt; i += 1) args.push(`o${i}?`);
    if (r.bool(0.4)) args.push(r.bool() ? 'rest...' : 'rest...?');
    if (args.some((a) => a.endsWith('...')) && opt > 0) args.splice(req, opt);   // a required variadic after optionals would be malformed; keep it simple
    const flags = {};
    for (let i = r.int(0, 3); i > 0; i -= 1) flags[`f${r.name()}`] = r.pick(KINDS);
    commands[key] = { args, flags, paths: [] };
  }
  // Drop a command key that is a prefix group of another (`a` and `a b`), which resolveCommand reads as the longer one.
  for (const k of Object.keys(commands)) if (Object.keys(commands).some((o) => o !== k && o.startsWith(`${k} `))) delete commands[k];
  return defineTable({ tool: 'prop', globalFlags, commands });
}

// A random tool call for a command: some flags, the required arguments and a prefix of the optional ones.
function randomInput(r, table, command) {
  const spec = table.commands[command];
  const kinds = { ...(table.globalFlags ?? {}), ...(spec.flags ?? {}) };
  const input = {};
  for (const [f, kind] of Object.entries(kinds)) {
    if (!r.bool(0.6)) continue;
    if (kind === 'bool') input[f] = r.bool();
    else if (kind === 'number') input[f] = r.pick([0, -1, 3.5, 1e6, r.int(-50, 50)]);
    else if (kind === 'many') input[f] = Array.from({ length: r.int(1, 3) }, () => r.word());
    else if (kind === 'path') input[f] = `${ABS}${r.word()}`;
    else input[f] = r.word();
  }
  let gap = false;
  for (const a of spec.args ?? []) {
    const name = a.replace(/[.?]+$/, '');
    const optional = a.endsWith('?');
    if (optional && (gap || !r.bool(0.6))) { gap = true; continue; }
    input[name] = a.includes('...') ? Array.from({ length: r.int(optional ? 1 : 1, 3) }, () => r.word()) : r.word();
  }
  return input;
}

// What parseArgs gives back for a call, in the call's own terms.
function expected(table, command, input) {
  const kinds = { ...(table.globalFlags ?? {}), ...(table.commands[command].flags ?? {}) };
  const flags = {};
  for (const [f, v] of Object.entries(input)) {
    const kind = kinds[f];
    if (kind === undefined) continue;
    if (kind === 'bool') { if (v) flags[f] = true; } else if (kind === 'many') flags[f] = v.length === 1 ? v[0] : v;
    else if (kind === 'number') flags[f] = Number(v);
    else flags[f] = v;
  }
  const args = {};
  for (const a of table.commands[command].args ?? []) {
    const name = a.replace(/[.?]+$/, '');
    if (input[name] !== undefined) args[name] = input[name];
  }
  return { command, args, flags };
}

describe('properties of the command line', () => {
  test('a tool call becomes argv that parseArgs reads back as exactly that call, for any table and any values', () => {
    const r = random();
    for (let i = 0; i < 400; i += 1) {
      const table = randomTable(r);
      const command = r.pick(Object.keys(table.commands));
      const input = randomInput(r, table, command);
      const argv = argvFor(table, command, input);
      const parsed = parseArgs(table, argv);
      const want = expected(table, command, input);
      assert.deepEqual({ command: parsed.command, args: parsed.args, flags: parsed.flags }, want, `case ${i} ${seedNote()}\ntable ${JSON.stringify(table)}\ninput ${JSON.stringify(input)}\nargv ${JSON.stringify(argv)}`);
    }
  });

  test('a command line may put its flags anywhere after the command, as --f=v or --f v, and parses the same', () => {
    const r = random();
    for (let i = 0; i < 400; i += 1) {
      const table = randomTable(r);
      const command = r.pick(Object.keys(table.commands));
      const input = randomInput(r, table, command);
      const canonical = parseArgs(table, argvFor(table, command, input));
      // Rebuild the line by hand. Each flag's own forms keep their order (a many flag's values are a list), and so do the positional words; apart from that the pieces are merged at random. A global flag may also come before the command; a word that starts with -- must go after a bare --.
      const kinds = { ...(table.globalFlags ?? {}), ...(table.commands[command].flags ?? {}) };
      const before = [];
      const sequences = [];
      for (const [f, v] of Object.entries(input)) {
        const kind = kinds[f];
        if (!kind) continue;
        const forms = kind === 'bool' ? (v ? [[`--${f}`]] : []) : [].concat(v).map((x) => (r.bool() ? [`--${f}=${x}`] : [`--${f}`, String(x)]));
        if (!forms.length) continue;
        if (Object.hasOwn(table.globalFlags ?? {}, f) && r.bool(0.3)) before.push(...forms); else sequences.push(forms);
      }
      const words = Object.values(canonical.args).flat();
      const dashed = words.some((w) => w.startsWith('--'));
      if (!dashed && words.length) sequences.push(words.map((w) => [w]));
      const merged = [];
      while (sequences.some((q) => q.length)) {
        const live = sequences.filter((q) => q.length);
        merged.push(r.pick(live).shift());
      }
      const line = [...before.flat(), ...command.split(' '), ...merged.flat(), ...(dashed ? ['--', ...words] : [])];
      const parsed = parseArgs(table, line);
      assert.deepEqual({ command: parsed.command, args: parsed.args, flags: parsed.flags }, { command: canonical.command, args: canonical.args, flags: canonical.flags }, `case ${i} ${seedNote()}\nline ${JSON.stringify(line)}`);
    }
  });

  test('every refusal of a malformed line is a UsageError, never another exception', () => {
    const r = random();
    for (let i = 0; i < 600; i += 1) {
      const table = randomTable(r);
      const line = Array.from({ length: r.int(0, 6) }, () => r.pick([r.word(3), `--${r.name()}`, `--${r.name()}=${r.word(2)}`, '--', ...Object.keys(table.commands).flatMap((k) => k.split(' ')), ...Object.keys(table.globalFlags ?? {}).map((f) => `--${f}`)]));
      try { parseArgs(table, line); } catch (e) {
        assert.ok(e instanceof UsageError && e.code === 'usage', `case ${i} ${seedNote()}: ${JSON.stringify(line)} threw ${e?.stack}`);
      }
    }
  });

  test('every generated tool lists exactly the fields argvFor accepts, and nothing else passes', () => {
    const r = random();
    for (let i = 0; i < 200; i += 1) {
      const table = randomTable(r);
      for (const tool of buildTools(table)) {
        const command = Object.keys(table.commands).find((c) => `prop_${c.replace(/[ -]/g, '_')}` === tool.name);
        const input = randomInput(r, table, command);
        assert.deepEqual(Object.keys(input).filter((k) => !Object.hasOwn(tool.inputSchema.properties, k)), [], `${tool.name} ${seedNote()}`);
        assert.throws(() => argvFor(table, command, { ...input, zzunknown: 'x' }), /unknown field "zzunknown"/);
      }
    }
  });
});

describe('properties of the lock', () => {
  // Mutual exclusion across processes: every child increments a counter under the lock with a read, a pause and a write; a lost update or two holders at once would show as a short count or an overlap in the log.
  test('several processes and async holders never hold the lock at once', { timeout: 120_000 }, async () => {
    const dir = mkdtempSync(join(tmp, 'mutex-'));
    const lock = join(dir, '.lock');
    const counter = join(dir, 'counter');
    const log = join(dir, 'log');
    writeFileSync(counter, '0');
    writeFileSync(log, '');
    const child = join(here, 'fixtures', 'lock-worker.mjs');
    const r = random();
    const procs = 5;
    const rounds = 30;
    const runs = Array.from({ length: procs }, (_, p) => new Promise((res, rej) => {
      const c = spawn(process.execPath, [child, lock, counter, log, String(rounds), p % 2 ? 'async' : 'sync', String(r.int(1, 1e9))], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      c.stderr.on('data', (d) => { err += d; });
      c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`worker ${p} exited ${code}: ${err}`))));
    }));
    await Promise.all(runs);
    assert.equal(readFileSync(counter, 'utf8'), String(procs * rounds), `no update lost ${seedNote()}`);
    const lines = readFileSync(log, 'utf8').trim().split('\n');
    for (let i = 0; i < lines.length; i += 2) {
      const [inWho, inWhat] = lines[i].split(' ');
      const [outWho, outWhat] = (lines[i + 1] ?? '').split(' ');
      assert.ok(inWhat === 'in' && outWhat === 'out' && inWho === outWho, `holders overlapped at line ${i}: ${lines.slice(i, i + 3).join(' | ')} ${seedNote()}`);
    }
    assert.ok(!existsSync(lock), 'the lock is released at the end');
  });

  // The staleness rules of the README, as a model: withLock takes over exactly the locks the model calls stale, and waits out (then refuses) the others without touching them.
  test('withLock takes over exactly the locks the documented rules call stale, and never touches a live one', async () => {
    const dead = spawnSync(process.execPath, ['-e', '0']).pid;
    const limits = { emptyMs: 300, staleMs: 600, reusedPidMs: 900 };
    const model = ({ content, host, pid, age }) => {
      if (content === 'empty') return age > limits.emptyMs;
      if (host === 'mine' && pid !== 'garbage') return pid === 'dead' ? true : age > limits.reusedPidMs;
      return age > limits.staleMs;
    };
    const r = random();
    for (let i = 0; i < 40; i += 1) {
      const c = { content: r.pick(['empty', 'holder', 'holder', 'holder']), host: r.pick(['mine', 'other']), pid: r.pick(['alive', 'dead', 'garbage']) };
      const limit = c.content === 'empty' ? limits.emptyMs : c.host === 'mine' && c.pid !== 'garbage' ? limits.reusedPidMs : limits.staleMs;
      c.age = r.bool() ? Math.floor(limit * 0.2) : limit * 3;   // well away from the edge, so the short wait below cannot cross it
      const dir = mkdtempSync(join(tmp, 'stale-'));
      const lock = join(dir, '.lock');
      const pidText = c.pid === 'alive' ? String(process.pid) : c.pid === 'dead' ? String(dead) : 'x1';
      const text = c.content === 'empty' ? '' : `${pidText} ${c.host === 'mine' ? hostname() : 'another-host.invalid'} 2026-01-01T00:00:00.000Z${r.bool() ? '\r' : ''}\n`;
      writeFileSync(lock, text);
      const at = (Date.now() - c.age) / 1000;
      utimesSync(lock, at, at);
      let ran = false;
      let error = null;
      try { withLock(lock, () => { ran = true; }, { ...limits, waitMs: 80 }); } catch (e) { error = e; }
      const stale = model(c);
      assert.equal(ran, stale, `case ${i} ${JSON.stringify(c)} ${seedNote()}`);
      if (stale) assert.ok(!existsSync(lock), 'a lock taken over is released');
      else {
        assert.ok(error instanceof LockHeldError && error.code === 'ELOCKED' && error.stale === false, `case ${i}: ${error}`);
        assert.equal(readFileSync(lock, 'utf8'), text, 'a live lock is never moved or rewritten');
      }
      // The async lock reads the same rules.
      if (!stale) {
        await assert.rejects(withLockAsync(lock, () => 1, { ...limits, waitMs: 60 }), (e) => e instanceof LockHeldError);
      }
    }
  });
});
