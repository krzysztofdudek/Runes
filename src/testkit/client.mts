/**
 * A minimal MCP client over a server's real stdio, for tests: requests correlated by id, notifications, raw lines, and every message the server sent kept in order.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface ClientOptions {
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** How long a request waits for its answer, in ms. Default 60 000: a loaded CI machine can take seconds to start a process. */
  timeoutMs?: number;
}

export interface McpTestClient {
  child: ChildProcess;
  /** Sends a request and resolves with the whole response message. `id` defaults to a counter. */
  request(method: string, params?: unknown, id?: string | number): Promise<Record<string, any>>;
  /** Calls a tool; resolves with the response message. */
  call(name: string, args?: Record<string, unknown>, id?: string | number): Promise<Record<string, any>>;
  notify(method: string, params?: unknown): void;
  /** Writes one line as given (an object is serialised). */
  raw(line: unknown): void;
  /** Every message the server sent, in order; a line that is not JSON as `{ raw }`. */
  seen: Record<string, any>[];
  stderr(): string;
  /** Resolves when the server exits. */
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  /** Closes stdin and kills the server. */
  stop(): void;
}

/** Starts a server and connects to its stdio. */
export function startMcpClient(options: ClientOptions): McpTestClient {
  const child = spawn(options.command, options.args ?? [], { cwd: options.cwd, env: options.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const pending = new Map<string, (m: Record<string, any>) => void>();
  const seen: Record<string, any>[] = [];
  let err = '';
  let next = 1;
  child.stderr?.on('data', (d) => { err += d; });
  createInterface({ input: child.stdout! }).on('line', (line) => {
    let m: Record<string, any>;
    try { m = JSON.parse(line); } catch { seen.push({ raw: line }); return; }
    seen.push(m);
    const k = JSON.stringify(m?.id);
    const done = pending.get(k);
    if (done) { pending.delete(k); done(m); }
  });
  const raw = (line: unknown): void => { child.stdin?.write(`${typeof line === 'string' ? line : JSON.stringify(line)}\n`); };
  const request = (method: string, params?: unknown, id: string | number = next++): Promise<Record<string, any>> => new Promise((res, rej) => {
    const t = setTimeout(() => { pending.delete(JSON.stringify(id)); rej(new Error(`no answer to ${method} (id ${JSON.stringify(id)}) — stderr so far:\n${err}`)); }, options.timeoutMs ?? 60_000);
    pending.set(JSON.stringify(id), (m) => { clearTimeout(t); res(m); });
    raw({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((r) => child.on('exit', (code, signal) => r({ code, signal })));
  return {
    child, request, raw, seen, exited,
    call: (name, args = {}, id) => request('tools/call', { name, arguments: args }, id),
    notify: (method, params) => raw({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) }),
    stderr: () => err,
    stop: () => { try { child.stdin?.end(); } catch { /* closed */ } try { child.kill('SIGKILL'); } catch { /* gone */ } },
  };
}

/** Starts a server, initializes it, lists its tools and stops it. */
export async function listToolsOverStdio(options: ClientOptions): Promise<Record<string, any>[]> {
  const c = startMcpClient(options);
  try {
    await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'runes-testkit', version: '0' } });
    c.notify('notifications/initialized');
    const r = await c.request('tools/list');
    if (!Array.isArray(r.result?.tools)) throw new Error(`tools/list answered without tools: ${JSON.stringify(r)}`);
    return r.result.tools;
  } finally { c.stop(); }
}
