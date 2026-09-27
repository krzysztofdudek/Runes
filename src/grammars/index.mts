/**
 * @chrisdudek/runes/grammars
 *
 * Grammar pins: the manifest of grammar and runtime pins, patches, and a build recipe verified by sha256. No grammar bytes live here.
 */
export { RUNES_VERSION as version } from '../version.mjs';

/** The subpath this module is published under. */
export const subpath = 'grammars';

export { GRAMMAR_MANIFEST_SCHEMA, validateGrammarManifest, parseGrammarManifest, type GrammarManifest, type GrammarPin, type GrammarSource } from './manifest.mjs';
