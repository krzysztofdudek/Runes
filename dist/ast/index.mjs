/**
 * @chrisdudek/runes/ast
 *
 * Syntax trees: `walk` and `closest` over tree-sitter syntax nodes, the per-run parse cache, and a parser host with an injected tree-sitter runtime and runtime identity.
 */
export { RUNES_VERSION as version } from '../version.mjs';
/** The subpath this module is published under. */
export const subpath = 'ast';
export { walk, closest } from './walk.mjs';
export { destroyParseCache } from './parse-cache.mjs';
export { createParserHost, fileSha256 } from './parser.mjs';
