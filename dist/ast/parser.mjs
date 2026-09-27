/**
 * A parser host over an injected tree-sitter runtime. No module of Runes imports `web-tree-sitter` by value: the consumer passes the runtime it loaded (its module namespace), so the grammars, the parsers and every tree come from one copy of the runtime, whether the consumer installed it from npm or vendored it. The consumer also passes the runtime's identity (for example the sha256 of its `web-tree-sitter.wasm`), which is folded into every grammar digest, because a runtime upgrade can change the trees a grammar produces just as a grammar upgrade can.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LANGUAGES, grammarExtensionForPath } from '../grammars/languages.mjs';
/** sha256 of a file's bytes, hex. A convenient runtime identity: the sha256 of the runtime's `web-tree-sitter.wasm`. */
export function fileSha256(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}
/**
 * Creates a parser host. Both the one-time runtime init and each grammar load are memoized as promises, set synchronously before the first await, so concurrent callers await the same single init or load instead of observing a half-loaded language (web-tree-sitter then throws `Incompatible language version 0`). A rejected promise is evicted so a later call retries. Parsers are cached one per grammar: they hold no per-parse state once their language is set.
 */
export function createParserHost(options) {
    const { runtime } = options;
    const languages = options.languages ?? LANGUAGES;
    const extToLanguage = new Map();
    for (const def of Object.values(languages))
        for (const ext of def.extensions)
            extToLanguage.set(ext.toLowerCase(), def.id);
    const grammarFor = (extension) => {
        const id = extToLanguage.get(extension.toLowerCase());
        return id !== undefined && Object.hasOwn(languages, id) ? languages[id]?.wasmFile : undefined;
    };
    const primaryExtension = (language) => (Object.hasOwn(languages, language) ? languages[language]?.extensions[0] : undefined);
    let initPromise = null;
    let initialized = false;
    const langCache = new Map();
    const parserCache = new Map();
    const wasmHashCache = new Map();
    const digestCache = new Map();
    let identity;
    const runtimeIdentity = () => {
        identity ??= typeof options.runtimeIdentity === 'function' ? options.runtimeIdentity() : options.runtimeIdentity;
        return identity;
    };
    const init = () => {
        if (initPromise === null) {
            const p = runtime.Parser.init().then(() => { initialized = true; });
            initPromise = p;
            p.catch(() => { if (initPromise === p)
                initPromise = null; });
        }
        return initPromise;
    };
    const resolveWasm = (wasmFile) => {
        for (const dir of options.grammarDirs) {
            const p = path.join(dir, wasmFile);
            if (existsSync(p))
                return p;
        }
        throw new Error(`grammar ${wasmFile} not found in ${options.grammarDirs.join(', ') || '(no grammar directories)'}; build it with buildGrammars from @chrisdudek/runes/grammars.`);
    };
    const loadLanguage = (wasmFile) => {
        let langP = langCache.get(wasmFile);
        if (langP === undefined) {
            const p = runtime.Language.load(resolveWasm(wasmFile));
            langP = p;
            langCache.set(wasmFile, p);
            p.catch(() => { if (langCache.get(wasmFile) === p)
                langCache.delete(wasmFile); });
        }
        return langP;
    };
    const getParser = async (extension) => {
        await init();
        const wasmFile = grammarFor(extension);
        if (wasmFile === undefined)
            throw new Error(`no parser for extension '${extension}'`);
        const lang = await loadLanguage(wasmFile);
        // Checked after the await so the first concurrent caller to resume wins the slot.
        const existing = parserCache.get(wasmFile);
        if (existing)
            return existing;
        const parser = new runtime.Parser();
        parser.setLanguage(lang);
        parserCache.set(wasmFile, parser);
        return parser;
    };
    const newParser = () => {
        if (!initialized)
            throw new Error('newParser: the tree-sitter runtime is not initialized yet; parse a file or await getParser first.');
        return new runtime.Parser();
    };
    /** A new parser for `extension`'s grammar, outside the cache. */
    const freshParser = async (extension) => {
        await getParser(extension);
        const lang = await loadLanguage(grammarFor(extension));
        const parser = new runtime.Parser();
        parser.setLanguage(lang);
        return parser;
    };
    const parseFile = async (filePath, content, language) => {
        const ext = (language !== undefined ? primaryExtension(language) : undefined) ?? grammarExtensionForPath(filePath);
        // A grammar's external scanner can trap on one pathological input (tree-sitter-ruby on a heredoc delimiter of 256+ characters). The trap leaves that parser unusable while a fresh parser over the same language parses normally, so a throwing parse drops its parser from the cache and retries once on a private fresh parser. The poisoned parser is not freed: a concurrent caller may still hold it and would hit freed memory instead of a clean throw.
        let tree;
        const first = await getParser(ext);
        try {
            tree = first.parse(content);
        }
        catch {
            for (const [key, cached] of parserCache)
                if (cached === first)
                    parserCache.delete(key);
            const fresh = await freshParser(ext);
            try {
                tree = fresh.parse(content);
            }
            finally {
                fresh.delete();
            }
        }
        if (tree === null)
            throw new Error(`tree-sitter failed to parse file: ${filePath}`);
        return tree;
    };
    const grammarWasmHash = (extension) => {
        const cached = wasmHashCache.get(extension);
        if (cached !== undefined)
            return cached;
        const wasmFile = grammarFor(extension);
        if (wasmFile === undefined)
            throw new Error(`no grammar for extension '${extension}'`);
        const hash = fileSha256(resolveWasm(wasmFile));
        wasmHashCache.set(extension, hash);
        return hash;
    };
    const grammarDigest = (extension) => {
        const cached = digestCache.get(extension);
        if (cached !== undefined)
            return cached;
        const digest = createHash('sha256').update(`web-tree-sitter:${runtimeIdentity()}\ngrammar:${grammarWasmHash(extension)}`).digest('hex');
        digestCache.set(extension, digest);
        return digest;
    };
    return {
        runtimeIdentity,
        getParser,
        async loadGrammarsFor(extensions) {
            const seen = new Set();
            for (const ext of extensions) {
                const wasmFile = grammarFor(ext);
                if (wasmFile === undefined || seen.has(wasmFile))
                    continue;
                seen.add(wasmFile);
                await getParser(ext);
            }
        },
        loadedParserFor(extension) {
            const wasmFile = grammarFor(extension);
            return wasmFile === undefined ? undefined : parserCache.get(wasmFile);
        },
        newParser,
        parseFile,
        async withParsedFile(filePath, content, fn, language) {
            const tree = await parseFile(filePath, content, language);
            try {
                return await fn(tree);
            }
            finally {
                tree.delete();
            }
        },
        grammarWasmHash,
        grammarDigest,
        grammarDigestForLanguage(languageId) {
            const ext = primaryExtension(languageId);
            return ext === undefined ? undefined : grammarDigest(ext);
        },
    };
}
