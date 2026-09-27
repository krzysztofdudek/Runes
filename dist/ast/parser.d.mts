import type { Language, Parser, Tree } from 'web-tree-sitter';
import { type LanguageDef } from '../grammars/languages.mjs';
/** The part of the `web-tree-sitter` module a parser host uses; `import * as TreeSitter from 'web-tree-sitter'` satisfies it. */
export interface TreeSitterRuntime {
    Parser: typeof Parser;
    Language: typeof Language;
}
export interface ParserHostOptions {
    /** The loaded runtime. */
    runtime: TreeSitterRuntime;
    /** Identity of the runtime, folded into every grammar digest; a function is called once, on first need. */
    runtimeIdentity: string | (() => string);
    /** Directories searched, in order, for a grammar's WASM file. */
    grammarDirs: readonly string[];
    /** The language table: extensions and grammar file per language. Default: the Runes table (`LANGUAGES` of `@chrisdudek/runes/grammars`). */
    languages?: Readonly<Record<string, LanguageDef>>;
}
export interface ParserHost {
    /** The runtime identity this host folds into its digests. */
    runtimeIdentity(): string;
    /** A cached parser for the grammar of `extension`, loading the grammar on first use. Throws when no language owns the extension. */
    getParser(extension: string): Promise<Parser>;
    /** Loads the grammar of every extension that has one, so `loadedParserFor` can parse synchronously afterwards. */
    loadGrammarsFor(extensions: Iterable<string>): Promise<void>;
    /** The parser of `extension` when its grammar is already loaded, else undefined. Never loads anything. */
    loadedParserFor(extension: string): Parser | undefined;
    /** A new parser with no language set, outside the cache; the caller deletes it. Needs the runtime initialized, which any earlier parse did. */
    newParser(): Parser;
    /** Parses `content` with the grammar of `filePath`'s extension, or of `language` when given. The caller deletes the tree. */
    parseFile(filePath: string, content: string, language?: string): Promise<Tree>;
    /** Parses a file, calls `fn` with the tree, and deletes the tree afterwards whatever `fn` does. */
    withParsedFile<T>(filePath: string, content: string, fn: (tree: Tree) => T | Promise<T>, language?: string): Promise<T>;
    /** sha256 of the grammar WASM of `extension`. Reads the file, never loads it. */
    grammarWasmHash(extension: string): string;
    /** Identity of the trees files with `extension` get: sha256 over the runtime identity and the grammar WASM hash. */
    grammarDigest(extension: string): string;
    /** `grammarDigest` of a language id, or undefined when the table has no such language. */
    grammarDigestForLanguage(languageId: string): string | undefined;
}
/** sha256 of a file's bytes, hex. A convenient runtime identity: the sha256 of the runtime's `web-tree-sitter.wasm`. */
export declare function fileSha256(file: string): string;
/**
 * Creates a parser host. Both the one-time runtime init and each grammar load are memoized as promises, set synchronously before the first await, so concurrent callers await the same single init or load instead of observing a half-loaded language (web-tree-sitter then throws `Incompatible language version 0`). A rejected promise is evicted so a later call retries. Parsers are cached one per grammar: they hold no per-parse state once their language is set.
 */
export declare function createParserHost(options: ParserHostOptions): ParserHost;
