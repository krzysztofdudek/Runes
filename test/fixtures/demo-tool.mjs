// A small tool for the MCP and parity tests: its command table, its usage text, and its dispatch, which both the CLI (demo-cli.mjs) and the in-process server run.
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { defineTable, CliError } from '@chrisdudek/runes/cli';

export const TABLE = defineTable({
  tool: 'demo',
  globalFlags: { json: 'bool', help: 'bool', root: 'path' },
  commands: {
    echo: { args: ['text', 'more...?'], flags: { upper: 'bool', times: 'number', tag: 'many' }, summary: 'Say it back.' },
    fail: { args: ['why'], summary: 'Refuse.' },
    check: { summary: 'A failed check: exit 2.' },
    note: { summary: 'Answer with a note on stderr.' },
    write: { args: ['file', 'content?'], paths: ['file'], writes: true, summary: 'Write a file.' },
    'store rm': { args: ['id'], writes: true, destructive: true, summary: 'Remove.' },
    export: { flags: { out: 'path' }, stdoutJson: 'out', writes: true, summary: 'Everything as JSON.' },
    sleep: { args: ['ms'], flags: { stubborn: 'bool' }, summary: 'Wait.' },
    tree: { summary: 'Start a grandchild and hang.' },
    hook: { internal: true },
  },
});

export const USAGE = `demo — a tool for tests

commands:
  echo <text> [more...] [--upper] [--times n] [--tag t]   say it back
  fail <why>                                              refuse
  check                                                   a failed check
  note                                                    a note on stderr
  write <file> [content]                                  write a file
  store rm <id>                                           remove
  export [--out file]                                     everything as JSON
  sleep <ms> [--stubborn]                                 wait
  tree                                                    start a grandchild and hang

options:
  --json    answer in JSON
`;

const wait = (ms, signal, stubborn) => new Promise((res) => {
  const t = setTimeout(res, ms);
  if (!stubborn) signal?.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
});

// One command: { value, text, notes, exitCode } or a thrown refusal. Async only for sleep and tree.
export function dispatch(command, args, flags, { signal, pidFile } = {}) {
  switch (command) {
    case 'echo': {
      let t = [args.text, ...(args.more ?? [])].join(' ');
      if (flags.upper) t = t.toUpperCase();
      t = Array.from({ length: flags.times ?? 1 }, () => t).join(' ');
      return { value: { text: t, tags: [].concat(flags.tag ?? []) }, text: t };
    }
    case 'fail': throw new CliError('refused', `refused: ${args.why}`, { why: 'the test asked for it', next: 'demo echo ok' });
    case 'check': return { value: { ok: false }, text: '✗ failed', exitCode: 2 };
    case 'note': return { value: { ok: true }, text: 'ok', notes: ['note: careful'] };
    case 'write': writeFileSync(args.file, args.content ?? ''); return { value: { wrote: args.file }, text: `wrote ${args.file}` };
    case 'store rm': return { value: { removed: args.id }, text: `removed ${args.id}` };
    case 'export': {
      const doc = { schema: 'demo-export/1', items: [1, 2] };
      if (flags.out) { writeFileSync(flags.out, JSON.stringify(doc)); return { value: { out: flags.out }, text: `wrote ${flags.out}` }; }
      return { value: doc, text: JSON.stringify(doc, null, 2) };
    }
    case 'sleep': return wait(Number(args.ms), signal, flags.stubborn).then(() => ({ value: { slept: Number(args.ms) }, text: `slept ${args.ms}` }));
    case 'tree': {
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { stdio: 'ignore' });
      if (pidFile) writeFileSync(pidFile, `${process.pid} ${child.pid}`);
      return new Promise(() => {});
    }
    default: throw new CliError('usage', `unknown command: ${command}`);
  }
}
