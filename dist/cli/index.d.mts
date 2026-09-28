/**
 * @chrisdudek/runes/cli
 *
 * CLI scaffolding: the command table, `parseArgs` driven by it, the `<tool>-error/1` error document, and the one-block `--json` rule. This index is the stable 1.x surface (docs/api.md); the table's helper functions and the usage-text reader behind the test kit's parity check are internal.
 */
export { RUNES_VERSION as version } from '../version.mjs';
export { defineTable, type CommandTable, type CommandSpec, type FlagKind } from './table.mjs';
export { parseArgs, type ParsedArgs, type ParseOptions, type FlagValue } from './parse.mjs';
export { CliError, UsageError, errorDocument, type ErrorDocument, type CliErrorOptions } from './error.mjs';
export { renderResult, renderFailure, emit, isSingleJsonBlock, type CommandResult, type Rendered, type FailureOptions, type Streams } from './output.mjs';
