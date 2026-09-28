/**
 * @chrisdudek/runes/mcp
 *
 * An MCP stdio server generated from a command table, with an in-process executor (the tool's dispatch function) and a spawn executor (the tool's CLI as a child process, killed with its tree on timeout, cancel or shutdown). This index is the stable 1.x surface (docs/api.md).
 */
export { RUNES_VERSION as version } from '../version.mjs';
export { buildTools, argvFor, answersJson, commandForTool, toolName, InvalidParams, type McpTool, type ToolOptions } from './tools.mjs';
export { createServer, serveStdio, inProcess, spawnCli, PROTOCOL_VERSION, PROTOCOL_VERSIONS, type ServerOptions, type McpServer, type Concurrency, type Executor, type InProcessExecutor, type SpawnExecutor, type CallContext, type PrepareResult, type ToolResult, type StdioOptions, type StdioHandle, type JsonRpcMessage, type JsonRpcReply, } from './server.mjs';
export { killTree, type KillOptions } from './process.mjs';
