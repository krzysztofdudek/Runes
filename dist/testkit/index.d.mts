/**
 * @chrisdudek/runes/testkit
 *
 * Test kit: the import and identifier guard, a deterministic git environment, CLI/usage/MCP parity, `tools/list` measurement, a stdio MCP test client, and the runtime pin check (a consumer's tree-sitter runtime and grammar packages against the grammar manifest). This index is the stable 1.x surface (docs/api.md), and so are the module files a vendoring consumer takes without the index: `parity.mjs`, `measure.mjs`, `client.mjs` and `runtime/index.mjs`.
 */
export { RUNES_VERSION as version } from '../version.mjs';
export { runGuard, guardPassed, formatGuardReport, guardConfig, DEFAULT_DOMAIN_WORDS, tokenize, type GuardOptions, type GuardReport, type GuardConfig, type GuardTool, type DomainTerm, type GuardFinding, type GuardRule, type Token, type TokenType, } from './guard/index.mjs';
export { gitEnv, makeTempRepo, type GitEnvOptions, type TempRepo } from './git.mjs';
export { parityProblems, assertParity, type ParityOptions, type UsageOptions } from './parity.mjs';
export { measureTools, formatToolsMeasure, type ToolsMeasure, type MeasureOptions } from './measure.mjs';
export { startMcpClient, listToolsOverStdio, type McpTestClient, type ClientOptions } from './client.mjs';
export { checkRuntimePins, formatRuntimePinReport, type RuntimePinOptions, type RuntimePinProblem } from './runtime/index.mjs';
