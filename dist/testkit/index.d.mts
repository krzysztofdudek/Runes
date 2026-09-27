/**
 * @chrisdudek/runes/testkit
 *
 * Test kit: the import and identifier guard, a deterministic git environment, CLI/usage/MCP parity, `tools/list` measurement, a stdio MCP test client, and the runtime pin check.
 */
export { RUNES_VERSION as version } from '../version.mjs';
/** The subpath this module is published under. */
export declare const subpath = "testkit";
export * from './guard/index.mjs';
export { gitEnv, makeTempRepo, gitLocalEnvVars, TEST_GIT_CONFIG, GIT_LOCAL_ENV_FALLBACK, type GitEnvOptions, type TempRepo } from './git.mjs';
export { parityProblems, assertParity, type ParityOptions } from './parity.mjs';
export { measureTools, formatToolsMeasure, type ToolsMeasure, type MeasureOptions } from './measure.mjs';
export { startMcpClient, listToolsOverStdio, type McpTestClient, type ClientOptions } from './client.mjs';
export { runtimePinProblems, type RuntimePinInput } from './runtime.mjs';
