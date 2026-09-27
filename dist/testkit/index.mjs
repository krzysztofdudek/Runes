/**
 * @chrisdudek/runes/testkit
 *
 * Test kit: the import and identifier guard, the runtime pin check (a consumer's tree-sitter runtime and grammar packages against the grammar manifest), and later the git test environment and CLI/MCP parity helpers.
 */
export { RUNES_VERSION as version } from '../version.mjs';
/** The subpath this module is published under. */
export const subpath = 'testkit';
export * from './guard/index.mjs';
export * from './runtime/index.mjs';
