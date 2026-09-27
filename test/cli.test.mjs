import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  defineTable, tableProblems, argSpec, commandFlags, pathFields, publicCommands, resolveCommand, parseArgs,
  CliError, UsageError, errorDocument, errorSchema, formatError, commandArgv,
  renderResult, renderFailure, emit, jsonBlock, isSingleJsonBlock, readUsage,
} from '@chrisdudek/runes/cli';

const TABLE = defineTable({
  tool: 'demo',
  globalFlags: { json: 'bool', root: 'path' },
  commands: {
    new: { args: ['title'], flags: { kind: 'value', tag: 'many', prio: 'number' }, writes: true },
    show: { args: ['id', 'field?'] },
    tag: { args: ['id', 'ops...'], writes: true },
    sources: { args: ['files...?'], paths: ['files'] },
    'decide steer': { args: ['target'], flags: { note: 'value' }, writes: true },
    'decide rm': { args: ['id'], writes: true, destructive: true },
    export: { flags: { out: 'path' }, stdoutJson: 'out' },
    hook: { internal: true },
  },
  aliases: { seed: 'decide', display: 'show' },
});

describe('the table', () => {
  test('a well-formed table has no problems; defineTable returns it', () => {
    assert.deepEqual(tableProblems(TABLE), []);
  });

  test('every kind of malformation is listed', () => {
    const bad = {
      tool: 'Demo',
      globalFlags: { json: 'bool' },
      commands: {
        'Bad Cmd': {},
        a: { args: ['x...', 'y'] },
        b: { args: ['x?', 'y'] },
        c: { args: ['x', 'x'], flags: { x: 'value', json: 'value', q: 'weird' } },
        d: { paths: ['nope'], stdoutJson: 'gone' },
        e: { args: ['json'] },
      },
      aliases: { a: 'b', z: 'missing' },
    };
    const p = tableProblems(bad).join('\n');
    for (const want of ['tool: "Demo"', '"Bad Cmd": not lower-case', 'variadic argument "x" is not last', 'required argument "y" after an optional', 'argument "x" twice', '"x" is both an argument and a flag', '--json is value here but bool', 'unknown kind "weird"', 'paths names "nope"', 'stdoutJson names --gone', '"json" is both an argument and a global flag', 'alias "a": is also a command', 'alias "z": names "missing"']) {
      assert.ok(p.includes(want), `missing: ${want}\n${p}`);
    }
    assert.throws(() => defineTable(bad), /malformed/);
  });

  test('argSpec reads ?, ... and ...?', () => {
    assert.deepEqual(argSpec('id'), { name: 'id', optional: false, variadic: false });
    assert.deepEqual(argSpec('why?'), { name: 'why', optional: true, variadic: false });
    assert.deepEqual(argSpec('files...'), { name: 'files', optional: false, variadic: true });
    assert.deepEqual(argSpec('files...?'), { name: 'files', optional: true, variadic: true });
    assert.throws(() => argSpec('Bad'), /not an argument/);
  });

  test('helpers: flags with globals, path fields, public commands, command resolution with aliases', () => {
    assert.deepEqual(commandFlags(TABLE, 'new'), { json: 'bool', root: 'path', kind: 'value', tag: 'many', prio: 'number' });
    assert.deepEqual([...pathFields(TABLE, 'sources')].sort(), ['files', 'root']);
    assert.deepEqual([...pathFields(TABLE, 'export')].sort(), ['out', 'root']);
    assert.ok(!publicCommands(TABLE).includes('hook'));
    assert.deepEqual(resolveCommand(TABLE, ['decide', 'steer', 'x']), { command: 'decide steer', consumed: 2 });
    assert.deepEqual(resolveCommand(TABLE, ['seed', 'rm', '1']), { command: 'decide rm', consumed: 2 });
    assert.deepEqual(resolveCommand(TABLE, ['display', '1']), { command: 'show', consumed: 1 });
    assert.equal(resolveCommand(TABLE, ['decide']), null);
    assert.equal(resolveCommand(TABLE, ['nope']), null);
  });
});

describe('parseArgs', () => {
  const P = (...argv) => parseArgs(TABLE, argv);

  test('arguments by name, flags by kind, inline and separate values', () => {
    const r = P('new', 'A title', '--kind', 'bug', '--tag=a', '--tag', 'b', '--prio', '2', '--json');
    assert.equal(r.command, 'new');
    assert.deepEqual(r.args, { title: 'A title' });
    assert.deepEqual(r.flags, { kind: 'bug', tag: ['a', 'b'], prio: 2, json: true });
    assert.deepEqual(P('new', 'x', '--tag', 'only').flags.tag, 'only');
  });

  test('a value flag always takes the next word, even one that starts with --', () => {
    assert.equal(P('new', 'x', '--kind', '--help').flags.kind, '--help');
  });

  test('a bare -- ends the flags; words after it are arguments', () => {
    const r = P('new', '--kind', 'k', '--', '--not a flag');
    assert.deepEqual(r.args, { title: '--not a flag' });
  });

  test('global flags may come before the command, others may not', () => {
    assert.equal(P('--root', '/r', 'show', '1').flags.root, '/r');
    assert.throws(() => P('--kind', 'x', 'new', 't'), (e) => e instanceof UsageError && e.code === 'usage' && /only --json, --root may come before it/.test(e.message));
  });

  test('subcommands and aliases; optional and variadic arguments', () => {
    assert.deepEqual(P('decide', 'steer', 'src/a', '--note', 'n').args, { target: 'src/a' });
    assert.equal(P('seed', 'rm', '7').command, 'decide rm');
    assert.deepEqual(P('show', '1').args, { id: '1' });
    assert.deepEqual(P('show', '1', 'title').args, { id: '1', field: 'title' });
    assert.deepEqual(P('tag', '1', '+a', '-b').args, { id: '1', ops: ['+a', '-b'] });
    assert.deepEqual(P('sources').args, {});
    assert.deepEqual(P('sources', 'a', 'b').args, { files: ['a', 'b'] });
    assert.equal(P().command, undefined);
    assert.equal(P('--json').command, undefined);
  });

  test('every refusal is a UsageError that says what is wrong', () => {
    const refuses = (argv, re) => assert.throws(() => P(...argv), (e) => e instanceof UsageError && re.test(e.message), argv.join(' '));
    refuses(['nope'], /unknown command: nope/);
    refuses(['decide'], /decide needs a subcommand: decide steer, decide rm/);
    refuses(['new', 'x', '--bogus'], /unknown flag --bogus for new — it takes --json, --root, --kind, --tag, --prio/);
    refuses(['new', 'x', '--json=yes'], /--json takes no value/);
    refuses(['new', 'x', '--kind'], /--kind needs a value/);
    refuses(['new', 'x', '--kind', 'a', '--kind', 'b'], /--kind given twice/);
    refuses(['new', 'x', '--prio', 'high'], /--prio takes a number/);
    refuses(['new', 'x', '--prio', ''], /--prio takes a number/);
    refuses(['new'], /new needs <title>/);
    refuses(['tag', '1'], /tag needs at least one <ops>/);
    refuses(['show', '1', 'f', 'extra'], /show takes at most 2 arguments — unexpected: "extra"/);
    refuses(['show', '--', '1', 'f', '--root'], /flags go before it/);
  });

  test('checkRequired: false leaves missing arguments to the command', () => {
    assert.deepEqual(parseArgs(TABLE, ['new'], { checkRequired: false }).args, {});
  });
});

describe('the error document', () => {
  test('a CliError becomes <tool>-error/1 with code, what, why and a runnable next', () => {
    const e = new CliError('not-found', 'no such issue: 9', { why: 'ids are numbers on file', next: 'demo list --json' });
    assert.deepEqual(errorDocument('demo', e), {
      schema: 'demo-error/1', code: 'not-found', what: 'no such issue: 9', why: 'ids are numbers on file', next: { command: ['demo', 'list', '--json'], text: 'demo list --json' },
    });
    assert.equal(errorSchema('grain'), 'grain-error/1');
  });

  test('anything else is command-error with its message; a lower-case code it carries is kept', () => {
    assert.deepEqual(errorDocument('demo', new Error('boom')), { schema: 'demo-error/1', code: 'command-error', what: 'boom', why: null, next: null });
    assert.equal(errorDocument('demo', Object.assign(new Error('x'), { code: 'ENOENT' })).code, 'command-error');
    assert.equal(errorDocument('demo', Object.assign(new Error('x'), { code: 'locked' })).code, 'locked');
    assert.equal(errorDocument('demo', 'a string').what, 'a string');
  });

  test('next.command only for a step a reader can run as given', () => {
    assert.deepEqual(commandArgv('demo show "a b" \'c d\'', ['demo']), ['demo', 'show', 'a b', 'c d']);
    assert.deepEqual(commandArgv('Run: demo list', ['demo']), ['demo', 'list']);
    assert.equal(commandArgv('demo new <title>', ['demo']), null);
    assert.equal(commandArgv('demo list [--all]', ['demo']), null);
    assert.equal(commandArgv('demo list — to see them', ['demo']), null);
    assert.equal(commandArgv('git status', ['demo']), null);
    assert.equal(commandArgv('', ['demo']), null);
    assert.equal(commandArgv(null, ['demo']), null);
    assert.deepEqual(errorDocument('demo', new CliError('x', 'w', { next: 'Run: git status' })).next, { command: null, text: 'git status' });
  });

  test('formatError: error[code], why and next on their lines', () => {
    assert.equal(formatError(new CliError('usage', 'bad', { why: 'because', next: 'demo --help' })), 'error[usage]: bad\n  why:  because\nnext: demo --help');
    assert.equal(formatError(new Error('plain')), 'error[command-error]: plain');
  });

  test('UsageError is a CliError with code usage and exit code 1 unless told otherwise', () => {
    const e = new UsageError('x');
    assert.ok(e instanceof CliError);
    assert.equal(e.code, 'usage');
    assert.equal(e.exitCode, 1);
    assert.equal(new UsageError('x', { exitCode: 2 }).exitCode, 2);
  });
});

describe('the one-block --json rule', () => {
  test('JSON mode: one document on stdout, notes on stderr', () => {
    const r = renderResult({ value: { ok: true }, text: 'ok', notes: ['note: one', 'note: two'] }, { json: true });
    assert.equal(r.stdout, '{\n  "ok": true\n}\n');
    assert.ok(isSingleJsonBlock(r.stdout));
    assert.equal(r.stderr, 'note: one\nnote: two\n');
    assert.equal(r.exitCode, 0);
  });

  test('text mode: the text on stdout, notes on stderr; an exit code passes through', () => {
    assert.deepEqual(renderResult({ value: 1, text: 'hello', exitCode: 2 }, { json: false }), { stdout: 'hello\n', stderr: '', exitCode: 2 });
    assert.equal(renderResult({ value: undefined }, { json: true }).stdout, 'null\n');
  });

  test('a failure in JSON mode is the error document as the one block, the text on stderr', () => {
    const r = renderFailure('demo', new UsageError('unknown flag --x', { exitCode: 2 }), { json: true });
    assert.ok(isSingleJsonBlock(r.stdout));
    assert.equal(JSON.parse(r.stdout).schema, 'demo-error/1');
    assert.equal(r.stderr, 'error[usage]: unknown flag --x\n');
    assert.equal(r.exitCode, 2);
    const t = renderFailure('demo', new Error('boom'), { json: false, format: (e) => e.message });
    assert.deepEqual(t, { stdout: '', stderr: 'boom\n', exitCode: 1 });
  });

  test('isSingleJsonBlock refuses two documents, trailing text and empty output', () => {
    assert.equal(isSingleJsonBlock('{"a":1}\n{"b":2}\n'), false);
    assert.equal(isSingleJsonBlock('{"a":1}\nnote: x\n'), false);
    assert.equal(isSingleJsonBlock(''), false);
    assert.equal(isSingleJsonBlock(jsonBlock([1, 2])), true);
  });

  test('emit writes both streams and returns the exit code', () => {
    const out = []; const err = [];
    const code = emit({ stdout: 'a\n', stderr: 'b\n', exitCode: 3 }, { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } });
    assert.deepEqual([out, err, code], [['a\n'], ['b\n'], 3]);
  });
});

describe('readUsage', () => {
  const USAGE = [
    'demo — a demo tool',
    '',
    'commands:',
    '  new "<title>" [--kind k] [--tag t]...   file an issue',
    '                                          with more words here (--prio n)',
    '  show <id> [field]                       print one',
    '  tag <id> <ops...>                       change tags',
    '  sources [files...]                      report sources',
    '  decide steer <target> [--note n]        steer',
    '  decide rm <id>                          withdraw',
    '  seed rm <id>                            the same, under its old name',
    '  export [--out file]                     everything',
    '  frobnicate                              not in the table',
    '',
    'options:',
    '  --json    answer in JSON',
  ].join('\n');

  test('blocks per command with synopsis, description and flags; unknown entries listed', () => {
    const { blocks, unknown } = readUsage(USAGE, TABLE);
    assert.deepEqual(Object.keys(blocks).sort(), ['decide rm', 'decide steer', 'export', 'new', 'show', 'sources', 'tag']);
    assert.equal(blocks.new.description, 'file an issue with more words here (--prio n)');
    assert.deepEqual(blocks.new.flags, ['kind', 'tag', 'prio']);
    assert.equal(blocks['decide rm'].synopsis, 'decide rm <id> | seed rm <id>');
    assert.deepEqual(unknown, ['frobnicate']);
  });

  test('a usage: header works too, and CRLF text reads the same', () => {
    const g = readUsage(USAGE.replace('commands:', 'usage: demo <command>').replace(/\n/g, '\r\n'), TABLE);
    assert.equal(Object.keys(g.blocks).length, 7);
  });
});
