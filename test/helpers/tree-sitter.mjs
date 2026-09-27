// The parser host the relation tests parse with: the pinned web-tree-sitter runtime, injected the way a consumer injects it, over the grammars the recipe built into .grammars/ (npm test builds them first, see scripts/build-grammars.mjs).
import * as TreeSitter from 'web-tree-sitter';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createParserHost, fileSha256 } from '@chrisdudek/runes/ast';
import { getLanguageForExtension } from '@chrisdudek/runes/grammars';

const require = createRequire(import.meta.url);
export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const GRAMMAR_DIR = process.env.RUNES_TEST_GRAMMARS ?? path.join(ROOT, '.grammars');
export const CATALOGUE_ROOT = path.join(ROOT, 'reference', 'relations');

export const host = createParserHost({
  runtime: TreeSitter,
  runtimeIdentity: () => fileSha256(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
  grammarDirs: [GRAMMAR_DIR],
});

export const withParsedFile = (filePath, content, fn, language) => host.withParsedFile(filePath, content, fn, language);

/** One parsed file as the extractors take it, with the host's parser factory for Kotlin recovery. */
export const parsedFile = (filePath, content, tree, language) => ({ path: filePath, content, tree, language, newParser: host.newParser });

/**
 * Parses N (path, code, language) specs, keeping every tree alive for the duration of `fn`, and deletes every tree (innermost first) even when `fn` throws. A spec whose language differs from its extension's (a C++ `.h` header) is parsed with that language's grammar, as relation extraction does.
 */
export async function withParsedFiles(specs, fn) {
  const step = (i, acc) => {
    if (i === specs.length) return Promise.resolve(fn(acc));
    const s = specs[i];
    const override = getLanguageForExtension(path.extname(s.path)) === s.language ? undefined : s.language;
    return host.withParsedFile(s.path, s.code, (tree) => step(i + 1, [...acc, parsedFile(s.path, s.code, tree, s.language)]), override);
  };
  return step(0, []);
}

/** Runs one extractor over one snippet: its declarations and its uses. */
export async function runExtractor(ex, language, ext, code) {
  const p = `x${ext}`;
  return host.withParsedFile(p, code, (tree) => {
    const file = parsedFile(p, code, tree, language);
    return { declarations: ex.declarations(file), uses: ex.uses(file) };
  });
}
