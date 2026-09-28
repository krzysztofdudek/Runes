/**
 * @chrisdudek/runes/ast
 *
 * Syntax trees: `walk` and `closest` over tree-sitter syntax nodes, the per-run parse cache, and a parser host with an injected tree-sitter runtime and runtime identity. This index is the stable 1.x surface (docs/api.md).
 */
export { RUNES_VERSION as version } from '../version.mjs';
export { walk, closest } from './walk.mjs';
export { destroyParseCache } from './parse-cache.mjs';
export { createParserHost, fileSha256 } from './parser.mjs';
