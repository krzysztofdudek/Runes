/**
 * @chrisdudek/runes/testkit
 *
 * Test kit: the import and identifier guard, CLI/usage/MCP parity, `tools/list` measurement, a stdio MCP test client, and the runtime pin check (a consumer's tree-sitter runtime and grammar packages against the grammar manifest). This index is the stable 1.x surface (docs/api.md), and it holds only what a family tool imports today (the deterministic git environment, `gitEnv` and `makeTempRepo`, stays an internal module Runes' own tests use); so are the module files a vendoring consumer takes without the index: `parity.mjs`, `measure.mjs`, `client.mjs` and `runtime/index.mjs`.
 */
export { runGuard, guardPassed, formatGuardReport, guardConfig, DEFAULT_DOMAIN_WORDS, tokenize, type GuardOptions, type GuardReport, type GuardConfig, type GuardTool, type DomainTerm, type GuardFinding, type GuardRule, type Token, type TokenType, } from './guard/index.mjs';
export { parityProblems, assertParity, type ParityOptions, type UsageOptions } from './parity.mjs';
export { measureTools, formatToolsMeasure, type ToolsMeasure, type MeasureOptions } from './measure.mjs';
export { startMcpClient, listToolsOverStdio, type McpTestClient, type ClientOptions } from './client.mjs';
export { checkRuntimePins, formatRuntimePinReport, type RuntimePinOptions, type RuntimePinProblem } from './runtime/index.mjs';
