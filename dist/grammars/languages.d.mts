/**
 * The language table: which file extensions a language owns, the grammar file it parses with, and the syntax-node types of its comments. The grammar pins themselves (repository, commit, sha256, how to build) live in grammars/manifest.json; this table only names the file a pin produces. Every `wasmFile` here is pinned in the manifest (a test checks it).
 *
 * The table covers the languages the relation extractors and AST checks read (TypeScript, TSX, JavaScript, Python, Go, Rust, Java, C#, C, C++, PHP, Ruby, Kotlin) plus JSON, YAML and TOML. The manifest pins more grammars than this (a consumer may parse further languages with its own table, see `createParserHost` in `@chrisdudek/runes/ast`).
 */
export interface LanguageDef {
    id: string;
    extensions: string[];
    /** The grammar file the parser loads, as named in the grammar manifest. */
    wasmFile: string;
    /** True when the grammar has an external scanner (src/scanner.c). */
    externalScanner: boolean;
    /** The grammar's syntax-node type names for comments. */
    commentTypes: string[];
    commentDelimiters: string[];
}
export declare const LANGUAGES: Record<string, LanguageDef>;
export declare const EXTENSION_TO_LANGUAGE: Record<string, string>;
/**
 * The extension that selects a file's grammar: its own extension, or `.rb` for the extension-less Ruby files (Rakefile, Gemfile, Guardfile, Capfile, Brewfile) that carry no extension to look up. Callers that pick a grammar or a relation extractor for a whole path use this instead of `path.extname`.
 */
export declare function grammarExtensionForPath(filePath: string): string;
/** The language of an extension, case-insensitively; `overrides` (lower-case extension to language id) wins over the table. */
export declare function getLanguageForExtension(ext: string, overrides?: Record<string, string>): string | null;
/**
 * The language of a file for RELATION extraction, which may differ from its extension's default in one place: a `.h` header. `.h` is used for both C and C++ headers, and the extension alone binds it to C. A `.h` is routed to C++ when its own directory holds a C++ file (any cpp extension) and no `.c` file: the sibling sources say which language the directory is written in. `siblingNames` lists the file names in the header's directory; it is called only for a `.h`.
 *
 * Only relation extraction should use this routing. Rules whose results are keyed on a file's bytes keep the extension's grammar, because they would not notice a grammar switch caused by a sibling file appearing or disappearing.
 */
export declare function relationLanguageForPath(filePath: string, siblingNames: () => Iterable<string>): string | null;
/** The canonical (first) extension of a language, used to pick its grammar when a file is parsed under a language other than its extension's (see relationLanguageForPath). */
export declare function primaryExtensionForLanguage(language: string): string | undefined;
/** The grammar file of an extension's language, or null when no language owns the extension. */
export declare function getGrammarForExtension(ext: string): {
    wasmFile: string;
} | null;
/** Human-readable name of a language id (`typescript` is "TypeScript", `csharp` is "C#"); any other id, known or not, gets its first letter capitalized, so the function is total. */
export declare function getLanguageDisplayName(languageId: string): string;
