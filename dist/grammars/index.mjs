/**
 * @chrisdudek/runes/grammars
 *
 * Grammar pins: the manifest of grammar, runtime and CLI pins with the patches, the build recipe verified by sha256, and the language table that maps file extensions to grammars. No grammar bytes live here.
 */
export { RUNES_VERSION as version } from '../version.mjs';
/** The subpath this module is published under. */
export const subpath = 'grammars';
export { GRAMMAR_MANIFEST_SCHEMA, validateGrammarManifest, parseGrammarManifest, syntaxNodeTypesFile } from './manifest.mjs';
export { buildGrammars, verifyGrammarFiles, loadGrammarManifest, shippedGrammarsDir } from './build.mjs';
export * from './languages.mjs';
