// The demo tool's MCP server, with the executor named by the first argument: in-process (dispatch in this process) or spawn (the CLI as a child).
import { fileURLToPath } from 'node:url';
import { createServer, serveStdio, inProcess, spawnCli } from '@chrisdudek/runes/mcp';
import { TABLE, USAGE, dispatch } from './demo-tool.mjs';

const mode = process.argv[2];
const cli = fileURLToPath(new URL('./demo-cli.mjs', import.meta.url));
const executor = mode === 'spawn'
  ? spawnCli({ args: [cli] })
  : inProcess(({ parsed, signal, data }) => dispatch(parsed.command, parsed.args, parsed.flags, { signal, pidFile: data?.pidFile }));

const server = createServer({
  table: TABLE,
  version: '1.2.3',
  executor,
  tools: { help: USAGE },
  timeoutMs: Number(process.env.DEMO_TIMEOUT_MS) || undefined,
  timeoutHint: () => 'Set DEMO_TIMEOUT_MS to allow longer.',
  // DEMO_CONCURRENCY: { "total": n, "perCommand": { "<command>": n } } (a command left out has no limit of its own).
  ...(process.env.DEMO_CONCURRENCY ? (() => {
    const c = JSON.parse(process.env.DEMO_CONCURRENCY);
    return { concurrency: { total: c.total, ...(c.perCommand ? { perCommand: (command) => c.perCommand[command] ?? Infinity } : {}) } };
  })() : {}),
  prepare: ({ command, input }) => (input.root ? { data: { pidFile: process.env.DEMO_PIDS } } : { notes: { where: `no root given (${command})` }, data: { pidFile: process.env.DEMO_PIDS } }),
});
serveStdio(server);
