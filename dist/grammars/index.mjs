/**
 * @chrisdudek/runes/grammars
 *
 * Grammar pins: the manifest of grammar, runtime and CLI pins with the patches, the build recipe verified by sha256, and the language table that maps file extensions to grammars. No grammar bytes live here. This index is the stable 1.x surface (docs/api.md); the manifest's validator and schema are internal.
 */
export { RUNES_VERSION as version } from '../version.mjs';
export { buildGrammars, verifyGrammarFiles, loadGrammarManifest } from './build.mjs';
export { LANGUAGES, EXTENSION_TO_LANGUAGE, grammarExtensionForPath, getLanguageForExtension, relationLanguageForPath, primaryExtensionForLanguage, getGrammarForExtension, getLanguageDisplayName, } from './languages.mjs';
