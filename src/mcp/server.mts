/**
 * An MCP server generated from a command table: a protocol adapter over a tool's CLI, never a second implementation. Two executors run a call:
 *
 * - **in process** (`inProcess(run)`): the call's argv is parsed by the table's `parseArgs` and handed to `run`, which calls the tool's own dispatch function and returns what the CLI would print (`{ value, text, notes, exitCode }`) or throws its refusal. Cheap, and right for a tool whose commands are quick. A **synchronous** `run` blocks the event loop while it runs: nothing else is read or answered until it returns, so `ping`, `tools/list`, a cancel and the timeout all wait for it, and a timeout can only fire after it has already finished. Only an **async** `run` that awaits and honours `ctx.signal` gets what the transport promises below (answers while it runs, a timeout or cancel that stops it). Either way a run cannot be killed: a timeout or a cancel drops its answer, and the next call waits for it to end.
 * - **spawn** (`spawnCli({ args: [bin] })`): the CLI itself runs as a child process; its stdout is the answer, its stderr the notes, a non-zero exit an error. The two surfaces are identical by construction, and a timeout or a cancel kills the CLI with its whole tree.
 *
 * Input transforms. `transformInput` rewrites a call's fields before they are checked and turned into argv (a path relative to a repository made absolute, a container path translated, a "bare name or absolute path" field validated by throwing `InvalidParams`); `transformArgv` rewrites the argv after. Both let a consumer keep its own path rules without forking the adapter.
 *
 * Result shape. With a JSON answer (`json: true`, or a command that prints JSON unasked) the content is exactly one text block, the document, so a client that concatenates blocks can parse it; every note (the CLI's stderr, what `prepare` says) goes into `_meta` under `<tool>/<key>`, never into a second block. A refusal in JSON mode is the `<tool>-error/1` document as that one block (with `errorDocuments: false`, the message text as that one block). Without JSON, the answer is the first text block and each note a block after it. A refusal or a non-zero exit comes back with `isError: true`. Input that does not fit a tool is a JSON-RPC -32602 error, and nothing runs.
 *
 * Transport (`serveStdio`): newline-delimited JSON-RPC 2.0 on stdin/stdout. By default tool calls run one at a time, in order. With the spawn executor, `concurrency` lets several run at once: `total` bounds the calls running together, `perCommand` the calls of one command (a number for every command, or a function of the command), and a call that would exceed either waits, in arrival order among the calls it competes with; answers then go out as calls finish, each under its own id. Each call has its own time limit, counted from when it starts running (not while it waits), and its own cancel. `initialize`, `ping` and `tools/list` are answered at once, never queued behind a running call (a synchronous in-process run still blocks everything while it runs, see above). `notifications/cancelled` stops a running call (killing its process tree) or drops a waiting one, and the cancelled request gets no answer. A cancel for any other id is ignored: one that arrives after its call was answered (a late cancel) does nothing, and a later request that reuses the id is answered as usual. Responses from the client are ignored. When stdin closes, or on SIGTERM, SIGINT or SIGHUP, every running call is stopped first; a signal then exits with 128 + its number.
 */
import { createInterface } from 'node:readline';
import { constants as osConstants } from 'node:os';
import type { Readable, Writable } from 'node:stream';
import type { CommandTable } from '../cli/table.mjs';
import { parseArgs, type ParsedArgs } from '../cli/parse.mjs';
import { errorDocument, errorParts } from '../cli/error.mjs';
import { isSingleJsonBlock, type CommandResult } from '../cli/output.mjs';
import { buildTools, argvFor, answersJson, commandForTool, toolName, prefixOf, InvalidParams, type McpTool, type ToolOptions } from './tools.mjs';
import { runProcess } from './process.mjs';

export const PROTOCOL_VERSION = '2025-06-18';
/** The versions the server speaks: it uses nothing a later one added beyond tool annotations, which an older client ignores. A client asking for one of these gets it back; any other gets `PROTOCOL_VERSION`. */
export const PROTOCOL_VERSIONS: readonly string[] = ['2025-06-18', '2025-03-26', '2024-11-05'];

export interface CallContext {
  command: string;
  /** The argv the CLI would get (command words, flags, `--`, arguments). */
  argv: string[];
  /** The tool call's fields, as given. */
  input: Record<string, unknown>;
  /** Whether the answer is a JSON document. */
  json: boolean;
  /** Aborted on timeout or cancel. */
  signal: AbortSignal;
  cwd: string | undefined;
  env: NodeJS.ProcessEnv | undefined;
  /** What `prepare` handed on. */
  data: unknown;
}

export interface InProcessExecutor {
  kind: 'in-process';
  run: (ctx: CallContext & { parsed: ParsedArgs }) => CommandResult | Promise<CommandResult>;
}

export interface SpawnExecutor {
  kind: 'spawn';
  /** The program. Default `process.execPath`. */
  command: string;
  /** Words before the call's argv, typically the CLI script. */
  args: readonly string[];
  /** How many of the last stderr lines to keep. Default 40. */
  stderrLines: number;
}

export type Executor = InProcessExecutor | SpawnExecutor;

/** Runs each call in this process through `run` (see the module note). */
export function inProcess(run: InProcessExecutor['run']): InProcessExecutor {
  return { kind: 'in-process', run };
}

/** Runs each call as `command ...args ...argv` (see the module note). */
export function spawnCli(options: { command?: string; args?: readonly string[]; stderrLines?: number } = {}): SpawnExecutor {
  return { kind: 'spawn', command: options.command ?? process.execPath, args: options.args ?? [], stderrLines: options.stderrLines ?? 40 };
}

export interface PrepareResult {
  /** The directory a spawned CLI runs in. Default the server's. */
  cwd?: string;
  /** The environment a spawned CLI gets. Default the server's. */
  env?: NodeJS.ProcessEnv;
  /** Notes for the answer, by key: `_meta['<tool>/<key>']` in JSON mode, text blocks otherwise. Say here what the call reached when it did not name it. */
  notes?: Record<string, string>;
  /** Anything the in-process run needs (a resolved root, say): `ctx.data`. */
  data?: unknown;
}

export interface ServerOptions {
  table: CommandTable;
  /** Server name in `initialize`. Default the table's tool. */
  name?: string;
  version: string;
  executor: Executor;
  tools?: ToolOptions;
  /** How long one call may run, in ms. Default 10 minutes. */
  timeoutMs?: number | ((command: string) => number);
  /** A sentence added to the timeout answer: how to allow longer. */
  timeoutHint?: (command: string) => string;
  /** Rewrites a call's fields before they are checked against the tool and turned into argv; may throw `InvalidParams`. The tool's schema is unchanged: a field the consumer resolves itself (a repository-relative path, say) is declared without `paths` and made absolute here. */
  transformInput?: (call: { command: string; input: Record<string, unknown> }) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Rewrites the argv built from the checked fields, before it runs; may throw `InvalidParams`. */
  transformArgv?: (call: { command: string; argv: string[]; input: Record<string, unknown> }) => string[] | Promise<string[]>;
  /** Runs before each call, after its fields are checked; may throw `InvalidParams`. */
  prepare?: (call: { command: string; input: Record<string, unknown> }) => PrepareResult | void | Promise<PrepareResult | void>;
  protocolVersions?: readonly string[];
  /** `instructions` in the `initialize` answer. */
  instructions?: string;
  /** A refusal in JSON mode answers with the `<tool>-error/1` document. Default true; false answers with the message text. Either way it is the one block, notes in `_meta`. */
  errorDocuments?: boolean;
  /**
   * How many tool calls `serveStdio` runs at once. Default one at a time, in order. `total` bounds all calls together, `perCommand` the calls of one command: a number for every command, or a function of the command (a CLI that serialises its own writes behind a lock can still say 1 for a command that must not overlap with itself). Each limit is a whole number from 1 up, or `Infinity`; a function's answer that is not counts as 1. Above one at a time the executor must be spawn: an in-process run cannot be stopped, so a timeout or a cancel would leave it running beside the next call, and `createServer` refuses the combination.
   */
  concurrency?: { total?: number; perCommand?: number | ((command: string) => number) };
}

/** How `serveStdio` schedules tool calls: `total` calls at once, and per tool the key it shares a limit under and that limit. */
export interface Concurrency {
  total: number;
  perTool(name: unknown): { key: string; limit: number };
}

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError: boolean;
  _meta?: Record<string, string>;
}

export type JsonRpcMessage = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown; result?: unknown; error?: unknown };
export type JsonRpcReply = { jsonrpc: '2.0'; id: unknown; result?: unknown; error?: { code: number; message: string } };

export interface McpServer {
  tools: McpTool[];
  /** The answer to one message, or null for a notification or a client response. A cancelled call answers null. */
  handle(msg: JsonRpcMessage, signal?: AbortSignal): Promise<JsonRpcReply | null>;
  /** One tool call. Throws `InvalidParams` for input that does not fit. */
  callTool(name: unknown, input: unknown, signal?: AbortSignal): Promise<ToolResult>;
  /** Resolves when no call's work is still running (an in-process run a timeout gave up on, say). */
  idle(): Promise<void>;
  /** How many calls may run at once; absent, one at a time. */
  concurrency?: Concurrency;
}

const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const isLimit = (n: unknown): n is number => n === Infinity || (typeof n === 'number' && Number.isInteger(n) && n >= 1);
const text = (t: string): { type: 'text'; text: string } => ({ type: 'text', text: t });
const seconds = (ms: number): string => (ms < 1000 ? `${ms} ms` : `${Math.round(ms / 1000)} s`);

type Outcome =
  | { kind: 'result'; result: CommandResult }
  | { kind: 'thrown'; error: unknown }
  | { kind: 'process'; code: number; stdout: string; stderr: string; endedBy: string | null };

/** A server over the table, answering one message at a time through `handle`; `serveStdio` puts it on stdin/stdout. */
export function createServer(options: ServerOptions): McpServer {
  const { table, executor } = options;
  const tool = table.tool;
  const toolOptions = options.tools ?? {};
  const tools = buildTools(table, toolOptions);
  const helpName = toolOptions.help !== undefined ? toolName(prefixOf(table, toolOptions), 'help') : null;
  const versions = options.protocolVersions ?? PROTOCOL_VERSIONS;
  const errorDocs = options.errorDocuments ?? true;
  const inflight = new Set<Promise<unknown>>();
  const meta = (notes: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(notes).map(([k, v]) => [`${tool}/${k}`, v]));
  const total = options.concurrency?.total ?? 1;
  const perCommand = options.concurrency?.perCommand ?? Infinity;
  if (!isLimit(total)) throw new TypeError(`concurrency.total must be a whole number from 1 up, or Infinity (got ${String(total)})`);
  if (typeof perCommand !== 'function' && !isLimit(perCommand)) throw new TypeError(`concurrency.perCommand must be a whole number from 1 up, Infinity, or a function of the command (got ${String(perCommand)})`);
  if (total > 1 && executor.kind !== 'spawn') throw new TypeError('concurrency above one call at a time needs the spawn executor: an in-process run cannot be stopped, so a timed-out or cancelled one would keep running beside the next call');
  const concurrency: Concurrency = {
    total,
    perTool(name: unknown) {
      const command = commandForTool(table, name, toolOptions);
      if (command === null) return { key: '', limit: Infinity };   // the help tool, or a name the call will refuse: nothing to hold back
      let n: unknown = perCommand;
      if (typeof perCommand === 'function') { try { n = perCommand(command); } catch { n = 1; } }
      return { key: command, limit: isLimit(n) ? n : 1 };
    },
  };
  const timeoutOf = (command: string): number => {
    const t = typeof options.timeoutMs === 'function' ? options.timeoutMs(command) : options.timeoutMs;
    return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : DEFAULT_TIMEOUT_MS;
  };

  function execute(ctx: CallContext): Promise<Outcome> {
    if (executor.kind === 'in-process') {
      return (async (): Promise<Outcome> => {
        try {
          const parsed = parseArgs(table, ctx.argv);
          return { kind: 'result', result: await executor.run({ ...ctx, parsed }) };
        } catch (error) { return { kind: 'thrown', error }; }
      })();
    }
    return runProcess(executor.command, [...executor.args, ...ctx.argv], { cwd: ctx.cwd, env: ctx.env, signal: ctx.signal })
      .then((r) => ({ kind: 'process', code: r.code, stdout: r.stdout, stderr: r.stderr, endedBy: r.stopped ? null : r.endedBy }));
  }

  function shape(ctx: CallContext, o: Outcome, notes: Record<string, string>): ToolResult {
    const noteBlocks = Object.values(notes).map(text);
    if (o.kind === 'result') {
      const r = o.result;
      const isError = (r.exitCode ?? 0) !== 0;
      const own = r.notes && r.notes.length ? r.notes.join('\n') : null;
      if (ctx.json) {
        const m = { ...(own ? { notes: own } : {}), ...notes };
        return { content: [text(JSON.stringify(r.value ?? null, null, 2))], isError, ...(Object.keys(m).length ? { _meta: meta(m) } : {}) };
      }
      return { content: [text(String(r.text ?? '')), ...(own ? [text(own)] : []), ...noteBlocks], isError };
    }
    if (o.kind === 'thrown') {
      if (ctx.json) {
        const block = errorDocs ? JSON.stringify(errorDocument(tool, o.error), null, 2) : errorParts(o.error).what;
        return { content: [text(block)], isError: true, ...(Object.keys(notes).length ? { _meta: meta(notes) } : {}) };
      }
      return { content: [text(errorParts(o.error).what), ...noteBlocks], isError: true };
    }
    const lines = o.stderr.trim() ? o.stderr.trim().split(/\r?\n/) : [];
    const keep = executor.kind === 'spawn' ? executor.stderrLines : 40;
    const errLines = o.endedBy ? [...lines, `[${tool}] the CLI was stopped by ${o.endedBy}`] : lines;
    const err = errLines.length ? (errLines.length > keep ? [`(${errLines.length - keep} earlier lines of stderr left out)`, ...errLines.slice(-keep)] : errLines).join('\n') : null;
    const out = o.stdout.replace(/\r?\n$/, '');
    if (ctx.json && (o.code === 0 || isSingleJsonBlock(o.stdout))) {
      const m = { ...(err ? { stderr: err } : {}), ...notes };
      return { content: [text(out)], isError: o.code !== 0, ...(Object.keys(m).length ? { _meta: meta(m) } : {}) };
    }
    const content = [...(out ? [text(out)] : []), ...(err ? [text(err)] : [])];
    if (!content.length) content.push(text(o.code === 0 ? '' : `${tool} exited with ${o.code} and said nothing`));
    return { content: [...content, ...noteBlocks], isError: o.code !== 0 };
  }

  async function callTool(name: unknown, input: unknown, signal?: AbortSignal): Promise<ToolResult> {
    if (helpName !== null && name === helpName) return { content: [text(toolOptions.help as string)], isError: false };
    const command = commandForTool(table, name, toolOptions);
    if (command === null) throw new InvalidParams(`Unknown tool: ${String(name)}`);
    let fields = (input ?? {}) as Record<string, unknown>;
    if (options.transformInput) {
      if (typeof fields !== 'object' || Array.isArray(fields)) throw new InvalidParams(`${String(name)}: arguments must be an object`);
      fields = await options.transformInput({ command, input: { ...fields } });
    }
    let argv = argvFor(table, command, fields, toolOptions);
    if (options.transformArgv) argv = await options.transformArgv({ command, argv: [...argv], input: fields });
    const prepared = (await options.prepare?.({ command, input: fields })) || {};
    const notes = prepared.notes ?? {};
    const ctrl = new AbortController();
    const onOuter = (): void => ctrl.abort('cancelled');
    if (signal?.aborted) ctrl.abort('cancelled');
    else signal?.addEventListener('abort', onOuter, { once: true });
    const ms = timeoutOf(command);
    const timer = setTimeout(() => ctrl.abort('timeout'), ms);
    const ctx: CallContext = { command, argv, input: fields, json: answersJson(table, command, fields), signal: ctrl.signal, cwd: prepared.cwd, env: prepared.env, data: prepared.data };
    const work = execute(ctx);
    inflight.add(work);
    void work.finally(() => inflight.delete(work));
    const stopped = new Promise<'stopped'>((r) => {
      if (ctrl.signal.aborted) r('stopped');
      else ctrl.signal.addEventListener('abort', () => r('stopped'), { once: true });
    });
    try {
      const o = await Promise.race([work, stopped]);
      // A spawned CLI answers once it is killed; wait for that, so the process is gone before the answer goes out.
      const settled = o === 'stopped' && executor.kind === 'spawn' ? await work : o;
      if (ctrl.signal.aborted) {
        if (ctrl.signal.reason === 'timeout') {
          const hint = options.timeoutHint?.(command);
          return { content: [text(`${tool} ${command} did not finish within ${seconds(ms)} and was stopped.${hint ? ` ${hint}` : ''}`)], isError: true };
        }
        return { content: [text(`${tool} ${command} was cancelled and stopped.`)], isError: true };
      }
      if (settled === 'stopped') throw new Error('unreachable');
      if (settled.kind === 'thrown' && settled.error instanceof InvalidParams) throw settled.error;
      return shape(ctx, settled, notes);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuter);
    }
  }

  async function handle(msg: JsonRpcMessage, signal?: AbortSignal): Promise<JsonRpcReply | null> {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
    const hasId = Object.hasOwn(msg, 'id');
    // A response from the client (to a request this server never sends): nothing to answer.
    if (msg.method === undefined && hasId && (Object.hasOwn(msg, 'result') || Object.hasOwn(msg, 'error'))) return null;
    if (typeof msg.method !== 'string') return hasId ? { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32600, message: 'Invalid Request' } } : null;
    if (!hasId) return null;   // a notification: nothing to answer
    const { id, method } = msg;
    const params = (msg.params ?? {}) as Record<string, unknown>;
    const ok = (result: unknown): JsonRpcReply => ({ jsonrpc: '2.0', id, result });
    const err = (code: number, message: string): JsonRpcReply => ({ jsonrpc: '2.0', id, error: { code, message } });
    if (method === 'initialize') {
      const asked = params.protocolVersion;
      return ok({
        protocolVersion: typeof asked === 'string' && versions.includes(asked) ? asked : versions[0] ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: options.name ?? tool, version: options.version },
        ...(options.instructions ? { instructions: options.instructions } : {}),
      });
    }
    if (method === 'ping') return ok({});
    if (method === 'tools/list') return ok({ tools });
    if (method === 'tools/call') {
      try {
        const result = await callTool(params.name, params.arguments, signal);
        return signal?.aborted ? null : ok(result);
      } catch (e) {
        if (signal?.aborted) return null;
        if (e instanceof InvalidParams) return err(-32602, e.message);
        return err(-32603, e instanceof Error ? e.message : String(e));
      }
    }
    return err(-32601, `Method not found: ${method}`);
  }

  return { tools, handle, callTool, idle: async () => { while (inflight.size) await Promise.allSettled([...inflight]); }, concurrency };
}

export interface StdioOptions {
  input?: Readable;
  output?: Writable;
  /** Handle SIGTERM, SIGINT and SIGHUP, and log uncaught errors instead of dying. Default true. */
  signals?: boolean;
  /** Called to leave. Default `process.exit`. */
  exit?: (code: number) => void;
  /** Diagnostics. Default stderr. */
  log?: (line: string) => void;
}

export interface StdioHandle {
  /** Stops every running call (killing spawned trees) and drops the queued ones. */
  stopAll(): void;
  /** Removes the signal handlers and stops reading. */
  close(): void;
}

/** Serves the server on stdin/stdout (see the module note). */
export function serveStdio(server: McpServer, options: StdioOptions = {}): StdioHandle {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const log = options.log ?? ((line: string) => { process.stderr.write(`${line}\n`); });
  const send = (m: unknown): void => { output.write(`${JSON.stringify(m)}\n`); };
  const key = (id: unknown): string => JSON.stringify(id);
  const total = server.concurrency?.total ?? 1;
  const slotOf = (msg: JsonRpcMessage): { key: string; limit: number } =>
    server.concurrency?.perTool((msg.params as { name?: unknown } | undefined)?.name) ?? { key: '', limit: Infinity };
  type Waiting = { msg: JsonRpcMessage; id: string; slot: { key: string; limit: number } };
  const waiting: Waiting[] = [];                              // calls not started yet, in arrival order
  const running = new Map<string, Set<AbortController>>();   // request id → the running calls' controllers
  const busy = new Map<string, number>();                     // per-command key → calls of it running
  let active = 0;

  async function answer(msg: JsonRpcMessage, call: boolean): Promise<void> {
    const ctrl = new AbortController();
    const k = key(msg.id);
    if (call) { const set = running.get(k) ?? new Set(); set.add(ctrl); running.set(k, set); }
    let reply: JsonRpcReply | null;
    try { reply = await server.handle(msg, ctrl.signal); } catch (e) {
      reply = { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } };
    } finally {
      if (call) { const set = running.get(k); set?.delete(ctrl); if (!set?.size) running.delete(k); }
    }
    if (reply && !ctrl.signal.aborted) send(reply);
  }

  // Starts every waiting call the limits let through, oldest first; a call held back by its command's limit does not hold back a later call of another command.
  function pump(): void {
    for (let i = 0; i < waiting.length && active < total;) {
      const w = waiting[i] as Waiting;
      if ((busy.get(w.slot.key) ?? 0) >= w.slot.limit) { i += 1; continue; }
      waiting.splice(i, 1);
      void run(w);
    }
  }

  async function run(w: Waiting): Promise<void> {
    active += 1;
    busy.set(w.slot.key, (busy.get(w.slot.key) ?? 0) + 1);
    try {
      await answer(w.msg, true);
      // One at a time: an in-process run a timeout gave up on still finishes before the next call starts.
      if (total === 1) await server.idle();
    } catch (e) { log(`[mcp] ${(e as Error)?.stack ?? e}`); } finally {
      active -= 1;
      const n = (busy.get(w.slot.key) ?? 1) - 1;
      if (n) busy.set(w.slot.key, n); else busy.delete(w.slot.key);
      pump();
    }
  }

  const onLine = (line: string): void => {
    const t = line.trim();
    if (!t) return;
    let msg: JsonRpcMessage;
    try { msg = JSON.parse(t) as JsonRpcMessage; } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
    if (msg && typeof msg === 'object' && msg.method === 'notifications/cancelled') {
      const id = (msg.params as { requestId?: unknown } | undefined)?.requestId;
      if (id === undefined) return;
      const k = key(id);
      for (const ctrl of running.get(k) ?? []) ctrl.abort('cancelled');
      for (let i = waiting.length - 1; i >= 0; i -= 1) if (waiting[i]?.id === k) waiting.splice(i, 1);
      return;
    }
    const isCall = !!msg && typeof msg === 'object' && msg.method === 'tools/call' && Object.hasOwn(msg, 'id');
    if (!isCall) { answer(msg, false).catch((e) => log(`[mcp] ${e?.stack ?? e}`)); return; }
    waiting.push({ msg, id: key(msg.id), slot: slotOf(msg) });
    pump();
  };

  const stopAll = (): void => {
    waiting.length = 0;
    for (const set of running.values()) for (const ctrl of set) ctrl.abort('cancelled');
  };

  const rl = createInterface({ input, crlfDelay: Infinity });
  rl.on('line', (line) => { try { onLine(line); } catch (e) { log(`[mcp] ${(e as Error)?.stack ?? e}`); } });
  // The client is gone: stop whatever runs and leave, answering nothing more.
  rl.on('close', () => { stopAll(); output.write('', () => exit(0)); });

  const handlers: [string, (...a: unknown[]) => void][] = [];
  if (options.signals ?? true) {
    for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
      const h = (): void => { stopAll(); exit(128 + (osConstants.signals[sig] ?? 0)); };
      handlers.push([sig, h]);
      process.on(sig, h);
    }
    const uncaught = (e: unknown): void => log(`[mcp] uncaught: ${(e as Error)?.stack ?? e}`);
    handlers.push(['uncaughtException', uncaught], ['unhandledRejection', uncaught]);
    process.on('uncaughtException', uncaught);
    process.on('unhandledRejection', uncaught);
  }
  return {
    stopAll,
    close: () => { for (const [ev, h] of handlers) process.off(ev, h); rl.removeAllListeners('close'); rl.close(); },
  };
}
