/**
 * The language table: which file extensions a language owns, the grammar file it parses with, and the syntax-node types of its comments. The grammar pins themselves (repository, commit, sha256, how to build) live in grammars/manifest.json; this table only names the file a pin produces. Every `wasmFile` here is pinned in the manifest (a test checks it).
 *
 * The table covers the languages the relation extractors and AST checks read (TypeScript, TSX, JavaScript, Python, Go, Rust, Java, C#, C, C++, PHP, Ruby, Kotlin) plus JSON, YAML and TOML. The manifest pins more grammars than this (a consumer may parse further languages with its own table, see `createParserHost` in `@chrisdudek/runes/ast`).
 */
// `commentTypes` and `commentDelimiters` were verified by parsing a sample with each grammar; they drive comment scanning (suppression markers, comment-based rules), so a wrong value silently breaks comment handling for that language.
export const LANGUAGES = {
    typescript: { id: 'typescript', extensions: ['.ts', '.mts', '.cts'], wasmFile: 'tree-sitter-typescript.wasm', externalScanner: true, commentTypes: ['comment'], commentDelimiters: ['//', '/*'] },
    tsx: { id: 'tsx', extensions: ['.tsx'], wasmFile: 'tree-sitter-tsx.wasm', externalScanner: true, commentTypes: ['comment'], commentDelimiters: ['//', '/*'] },
    javascript: { id: 'javascript', extensions: ['.js', '.mjs', '.cjs', '.jsx'], wasmFile: 'tree-sitter-javascript.wasm', externalScanner: true, commentTypes: ['comment'], commentDelimiters: ['//', '/*'] },
    python: { id: 'python', extensions: ['.py'], wasmFile: 'tree-sitter-python.wasm', externalScanner: true, commentTypes: ['comment'], commentDelimiters: ['#'] },
    go: { id: 'go', extensions: ['.go'], wasmFile: 'tree-sitter-go.wasm', externalScanner: false, commentTypes: ['comment'], commentDelimiters: ['//', '/*'] },
    rust: { id: 'rust', extensions: ['.rs'], wasmFile: 'tree-sitter-rust.wasm', externalScanner: true, commentTypes: ['line_comment', 'block_comment'], commentDelimiters: ['//', '/*'] },
    java: { id: 'java', extensions: ['.java'], wasmFile: 'tree-sitter-java.wasm', externalScanner: false, commentTypes: ['line_comment', 'block_comment'], commentDelimiters: ['//', '/*'] },
    csharp: { id: 'csharp', extensions: ['.cs'], wasmFile: 'tree-sitter-c_sharp.wasm', externalScanner: true, commentTypes: ['comment'], commentDelimiters: ['//', '/*'] },
    c: { id: 'c', extensions: ['.c', '.h'], wasmFile: 'tree-sitter-c.wasm', externalScanner: false, commentTypes: ['comment'], commentDelimiters: ['//', '/*'] },
    cpp: {
        id: 'cpp',
        // Besides sources and headers: C++20 module interface units (.cppm Clang/CMake, .ixx MSVC, .mpp) and template-implementation files (.ipp/.inl/.tpp/.txx), which are C++ and carry real #include dependencies; .c++/.h++ are rarer spellings of the same.
        extensions: ['.cpp', '.cc', '.cxx', '.c++', '.hpp', '.hh', '.hxx', '.h++', '.cppm', '.ixx', '.mpp', '.ipp', '.inl', '.tpp', '.txx'],
        wasmFile: 'tree-sitter-cpp.wasm',
        externalScanner: true,
        commentTypes: ['comment'],
        commentDelimiters: ['//', '/*'],
    },
    // The `php` grammar (PHP with the HTML around it), not `php_only`: the note on the php pin in grammars/manifest.json says why.
    php: { id: 'php', extensions: ['.php'], wasmFile: 'tree-sitter-php.wasm', externalScanner: true, commentTypes: ['comment'], commentDelimiters: ['//', '#', '/*'] },
    ruby: {
        id: 'ruby',
        // `.rake` task files, `.gemspec` specs and Rack's `config.ru` are plain Ruby; the extension-less Ruby files (Rakefile, Gemfile, ...) are mapped by basename below.
        extensions: ['.rb', '.rake', '.gemspec', '.ru'],
        wasmFile: 'tree-sitter-ruby.wasm',
        externalScanner: true,
        commentTypes: ['comment'],
        commentDelimiters: ['#'],
    },
    json: { id: 'json', extensions: ['.json'], wasmFile: 'tree-sitter-json.wasm', externalScanner: false, commentTypes: [], commentDelimiters: [] },
    kotlin: { id: 'kotlin', extensions: ['.kt', '.kts'], wasmFile: 'tree-sitter-kotlin.wasm', externalScanner: true, commentTypes: ['line_comment', 'block_comment'], commentDelimiters: ['//', '/*'] },
    yaml: { id: 'yaml', extensions: ['.yaml', '.yml'], wasmFile: 'tree-sitter-yaml.wasm', externalScanner: true, commentTypes: ['comment'], commentDelimiters: ['#'] },
    toml: { id: 'toml', extensions: ['.toml'], wasmFile: 'tree-sitter-toml.wasm', externalScanner: true, commentTypes: ['comment'], commentDelimiters: ['#'] },
};
export const EXTENSION_TO_LANGUAGE = Object.fromEntries(Object.values(LANGUAGES).flatMap((def) => def.extensions.map((ext) => [ext, def.id])));
/** Extension-less files that are Ruby source by convention, mapped to the Ruby grammar. */
const RUBY_BASENAMES = new Set(['Rakefile', 'Gemfile', 'Guardfile', 'Capfile', 'Brewfile']);
/**
 * The extension that selects a file's grammar: its own extension, or `.rb` for the extension-less Ruby files (Rakefile, Gemfile, Guardfile, Capfile, Brewfile) that carry no extension to look up. Callers that pick a grammar or a relation extractor for a whole path use this instead of `path.extname`.
 */
export function grammarExtensionForPath(filePath) {
    const base = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
    if (RUBY_BASENAMES.has(base))
        return '.rb';
    const dot = base.lastIndexOf('.');
    return dot <= 0 ? '' : base.slice(dot);
}
/** The language of an extension, case-insensitively; `overrides` (lower-case extension to language id) wins over the table. */
export function getLanguageForExtension(ext, overrides) {
    const normalized = ext.toLowerCase();
    if (overrides && Object.hasOwn(overrides, normalized))
        return overrides[normalized] ?? null;
    return Object.hasOwn(EXTENSION_TO_LANGUAGE, normalized) ? (EXTENSION_TO_LANGUAGE[normalized] ?? null) : null;
}
/**
 * The language of a file for RELATION extraction, which may differ from its extension's default in one place: a `.h` header. `.h` is used for both C and C++ headers, and the extension alone binds it to C. A `.h` is routed to C++ when its own directory holds a C++ file (any cpp extension) and no `.c` file: the sibling sources say which language the directory is written in. `siblingNames` lists the file names in the header's directory; it is called only for a `.h`.
 *
 * Only relation extraction should use this routing. Rules whose results are keyed on a file's bytes keep the extension's grammar, because they would not notice a grammar switch caused by a sibling file appearing or disappearing.
 */
export function relationLanguageForPath(filePath, siblingNames) {
    const ext = grammarExtensionForPath(filePath);
    const language = getLanguageForExtension(ext);
    if (language !== 'c' || ext.toLowerCase() !== '.h')
        return language;
    let sawCpp = false;
    for (const name of siblingNames()) {
        const d = name.lastIndexOf('.');
        if (d <= 0)
            continue;
        const sibExt = name.slice(d).toLowerCase();
        if (sibExt === '.c')
            return 'c';
        if (EXTENSION_TO_LANGUAGE[sibExt] === 'cpp')
            sawCpp = true;
    }
    return sawCpp ? 'cpp' : 'c';
}
/** The canonical (first) extension of a language, used to pick its grammar when a file is parsed under a language other than its extension's (see relationLanguageForPath). */
export function primaryExtensionForLanguage(language) {
    const def = Object.hasOwn(LANGUAGES, language) ? LANGUAGES[language] : undefined;
    return def?.extensions[0];
}
/** The grammar file of an extension's language, or null when no language owns the extension. */
export function getGrammarForExtension(ext) {
    const lang = getLanguageForExtension(ext.toLowerCase());
    if (lang === null)
        return null;
    // Own-property guard: a key inherited from Object.prototype ('constructor', 'toString', ...) is not a language.
    const def = Object.hasOwn(LANGUAGES, lang) ? LANGUAGES[lang] : undefined;
    if (!def)
        return null;
    return { wasmFile: def.wasmFile };
}
/** Language ids whose display name is not a first-letter capitalization of the id. */
const LANGUAGE_DISPLAY_NAMES = {
    typescript: 'TypeScript',
    tsx: 'TSX',
    javascript: 'JavaScript',
    csharp: 'C#',
    cpp: 'C++',
    php: 'PHP',
    json: 'JSON',
    yaml: 'YAML',
    toml: 'TOML',
};
/** Human-readable name of a language id (`typescript` is "TypeScript", `csharp` is "C#"); any other id, known or not, gets its first letter capitalized, so the function is total. */
export function getLanguageDisplayName(languageId) {
    const explicit = Object.hasOwn(LANGUAGE_DISPLAY_NAMES, languageId) ? LANGUAGE_DISPLAY_NAMES[languageId] : undefined;
    if (explicit !== undefined)
        return explicit;
    if (languageId.length === 0)
        return languageId;
    return languageId.charAt(0).toUpperCase() + languageId.slice(1);
}
