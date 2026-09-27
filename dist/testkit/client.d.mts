/**
 * A minimal MCP client over a server's real stdio, for tests: requests correlated by id, notifications, raw lines, and every message the server sent kept in order.
 */
import { type ChildProcess } from 'node:child_process';
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
    exited: Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
    }>;
    /** Closes stdin and kills the server. */
    stop(): void;
}
/** Starts a server and connects to its stdio. */
export declare function startMcpClient(options: ClientOptions): McpTestClient;
/** Starts a server, initializes it, lists its tools and stops it. */
export declare function listToolsOverStdio(options: ClientOptions): Promise<Record<string, any>[]>;
