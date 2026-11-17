/**
 * A parser host over an injected tree-sitter runtime. No module of Runes imports `web-tree-sitter` by value: the consumer passes the runtime it loaded (its module namespace), so the grammars, the parsers and every tree come from one copy of the runtime, whether the consumer installed it from npm or vendored it. The consumer also passes the runtime's identity (for example the sha256 of its `web-tree-sitter.wasm`), which is folded into every grammar digest, because a runtime upgrade can change the trees a grammar produces just as a grammar upgrade can.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Language, Parser, ParseState, Tree } from 'web-tree-sitter';
import { LANGUAGES, grammarExtensionForPath, type LanguageDef } from '../grammars/languages.mjs';

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

/** Options of one parse. */
export interface ParseFileOptions {
  /** Called by the runtime as the parse proceeds, with the runtime's `ParseState`. Returning `true` stops the parse: the parser is reset and the call rejects with an error whose `code` is `EPARSESTOPPED`. A callback that throws stops it the same way, and the call rejects with what it threw. */
  progressCallback?: (state: ParseState) => boolean | void;
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
  /** Parses `content` with the grammar of `filePath`'s extension, or of `language` when given. The caller deletes the tree. When the runtime aborts, the call rejects with `code` `ERUNTIMEABORTED`, and so does every call on this host from then on, those already waiting included. */
  parseFile(filePath: string, content: string, language?: string, options?: ParseFileOptions): Promise<Tree>;
  /** Parses a file, calls `fn` with the tree, and deletes the tree afterwards whatever `fn` does. A stopped parse never calls `fn`. */
  withParsedFile<T>(filePath: string, content: string, fn: (tree: Tree) => T | Promise<T>, language?: string, options?: ParseFileOptions): Promise<T>;
  /** sha256 of the grammar WASM of `extension`. Reads the file, never loads it. */
  grammarWasmHash(extension: string): string;
  /** Identity of the trees files with `extension` get: sha256 over the runtime identity and the grammar WASM hash. */
  grammarDigest(extension: string): string;
  /** `grammarDigest` of a language id, or undefined when the table has no such language. */
  grammarDigestForLanguage(languageId: string): string | undefined;
}

/** sha256 of a file's bytes, hex. A convenient runtime identity: the sha256 of the runtime's `web-tree-sitter.wasm`. */
export function fileSha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * Creates a parser host. Both the one-time runtime init and each grammar load are memoized as promises, set synchronously before the first await, so concurrent callers await the same single init or load instead of observing a half-loaded language (web-tree-sitter then throws `Incompatible language version 0`). A rejected promise is evicted so a later call retries. Parsers are cached one per grammar: they hold no per-parse state once their language is set.
 */
export function createParserHost(options: ParserHostOptions): ParserHost {
  const { runtime } = options;
  const languages = options.languages ?? LANGUAGES;
  const extToLanguage = new Map<string, string>();
  for (const def of Object.values(languages)) for (const ext of def.extensions) extToLanguage.set(ext.toLowerCase(), def.id);
  const grammarFor = (extension: string): string | undefined => {
    const id = extToLanguage.get(extension.toLowerCase());
    return id !== undefined && Object.hasOwn(languages, id) ? languages[id]?.wasmFile : undefined;
  };
  const primaryExtension = (language: string): string | undefined => (Object.hasOwn(languages, language) ? languages[language]?.extensions[0] : undefined);

  let initPromise: Promise<void> | null = null;
  let initialized = false;
  const langCache = new Map<string, Promise<Language>>();
  const parserCache = new Map<string, Parser>();
  const wasmHashCache = new Map<string, string>();
  const digestCache = new Map<string, string>();
  let identity: string | undefined;

  const runtimeIdentity = (): string => {
    identity ??= typeof options.runtimeIdentity === 'function' ? options.runtimeIdentity() : options.runtimeIdentity;
    return identity;
  };

  const init = (): Promise<void> => {
    if (initPromise === null) {
      const p = runtime.Parser.init().then(() => { initialized = true; });
      initPromise = p;
      p.catch(() => { if (initPromise === p) initPromise = null; });
    }
    return initPromise;
  };

  const resolveWasm = (wasmFile: string): string => {
    for (const dir of options.grammarDirs) {
      const p = path.join(dir, wasmFile);
      if (existsSync(p)) return p;
    }
    throw new Error(`grammar ${wasmFile} not found in ${options.grammarDirs.join(', ') || '(no grammar directories)'}; build it with buildGrammars from @chrisdudek/runes/grammars.`);
  };

  // The runtime aborts (at its 2 GiB memory limit, for one) by throwing a RuntimeError whose message starts with `Aborted(`, and stays damaged for the rest of the process: a grammar load, a parser or a parse made afterwards can fail on anything. So an abort is not retried, and from then on the host makes no call into the runtime and hands out no parser: each place that does checks first, with no wait between the check and the call.
  let abortedOn: { filePath: string; error: unknown } | undefined;
  const isAbort = (error: unknown): boolean => error instanceof Error && error.message.startsWith('Aborted(');
  const abortedError = (filePath?: string): Error => {
    const { filePath: first, error } = abortedOn!;
    const what = first === filePath ? `while parsing ${filePath}` : `earlier, while parsing ${first}${filePath === undefined ? '' : `, so ${filePath} was not parsed`}`;
    return Object.assign(new Error(`the tree-sitter runtime aborted ${what} (${(error as Error).message.split('\n')[0]}); it stays damaged for the rest of this process, so this host parses nothing more: restart the process`, { cause: error }), { code: 'ERUNTIMEABORTED' });
  };
  const failIfAborted = (filePath?: string): void => {
    if (abortedOn !== undefined) throw abortedError(filePath);
  };
  const failOnAbort = (filePath: string, error: unknown): void => {
    if (!isAbort(error)) return;
    abortedOn ??= { filePath, error };
    throw abortedError(filePath);
  };

  const loadLanguage = (wasmFile: string): Promise<Language> => {
    let langP = langCache.get(wasmFile);
    if (langP === undefined) {
      failIfAborted();
      const p = runtime.Language.load(resolveWasm(wasmFile));
      langP = p;
      langCache.set(wasmFile, p);
      p.catch(() => { if (langCache.get(wasmFile) === p) langCache.delete(wasmFile); });
    }
    return langP;
  };

  const makeParser = (lang: Language): Parser => {
    const parser = new runtime.Parser();
    parser.setLanguage(lang);
    return parser;
  };

  const loadedLanguages = new Map<string, Language>();
  const getParser = async (extension: string): Promise<Parser> => {
    await init();
    const wasmFile = grammarFor(extension);
    if (wasmFile === undefined) throw new Error(`no parser for extension '${extension}'`);
    const lang = await loadLanguage(wasmFile);
    loadedLanguages.set(wasmFile, lang);
    failIfAborted();
    // Checked after the await so the first concurrent caller to resume wins the slot.
    const existing = parserCache.get(wasmFile);
    if (existing) return existing;
    const parser = makeParser(lang);
    parserCache.set(wasmFile, parser);
    return parser;
  };

  const newParser = (): Parser => {
    if (!initialized) throw new Error('newParser: the tree-sitter runtime is not initialized yet; parse a file or await getParser first.');
    failIfAborted();
    return new runtime.Parser();
  };

  const parseFile = async (filePath: string, content: string, language?: string, options?: ParseFileOptions): Promise<Tree> => {
    if (typeof language === 'object' && language !== null) throw new TypeError(`parseFile of ${filePath}: the language is a string, null or undefined, and the options go after it`);
    const ext = (language !== undefined ? primaryExtension(language) : undefined) ?? grammarExtensionForPath(filePath);
    const progress = options?.progressCallback;
    let stop: { thrown: boolean; error: unknown } | undefined;
    const run = (parser: Parser): Tree | null => {
      failIfAborted(filePath);
      if (progress === undefined) return parser.parse(content);
      stop = undefined;
      // A throw inside the runtime's callback would unwind through the parser mid-parse, so it is caught here and turned into a stop.
      const tree = parser.parse(content, null, {
        progressCallback: (state) => {
          try {
            if (progress(state) === true) stop = { thrown: false, error: undefined };
          } catch (error) {
            stop = { thrown: true, error };
          }
          return stop !== undefined;
        },
      });
      // A stopped parse resumes on the parser's next call unless the parser is reset.
      if (tree === null) parser.reset();
      return tree;
    };
    let tree: Tree | null;
    try {
      const first = await getParser(ext);
      // A grammar's external scanner can trap on one pathological input (tree-sitter-ruby on a heredoc delimiter of 256+ characters). The trap leaves that parser unusable while a fresh parser over the same language parses normally, so a throwing parse drops its parser from the cache and retries once on a private fresh parser, made from the language already loaded. The retry follows the trap with no wait, so no other call runs between them. The poisoned parser is not freed: a concurrent caller may still hold it and would hit freed memory instead of a clean throw.
      try {
        tree = run(first);
      } catch (error) {
        failOnAbort(filePath, error);
        // After an abort the runtime is damaged, so the host makes no fresh parser on it.
        if (abortedOn !== undefined) throw error;
        for (const [key, cached] of parserCache) if (cached === first) parserCache.delete(key);
        const fresh = makeParser(loadedLanguages.get(grammarFor(ext)!)!);
        try {
          tree = run(fresh);
        } catch (retryError) {
          failOnAbort(filePath, retryError);
          throw retryError;
        } finally {
          fresh.delete();
        }
      }
    } catch (error) {
      // A call that was waiting when another call aborted fails on whatever the damaged runtime throws, or on a check; either way it is told why.
      if (abortedOn !== undefined) throw abortedError(filePath);
      throw error;
    }
    if (tree === null && stop !== undefined) {
      if (stop.thrown) throw stop.error;
      throw Object.assign(new Error(`tree-sitter parse of ${filePath} stopped by its progress callback`), { code: 'EPARSESTOPPED' });
    }
    if (tree === null) throw new Error(`tree-sitter failed to parse file: ${filePath}`);
    return tree;
  };

  const grammarWasmHash = (extension: string): string => {
    const cached = wasmHashCache.get(extension);
    if (cached !== undefined) return cached;
    const wasmFile = grammarFor(extension);
    if (wasmFile === undefined) throw new Error(`no grammar for extension '${extension}'`);
    const hash = fileSha256(resolveWasm(wasmFile));
    wasmHashCache.set(extension, hash);
    return hash;
  };

  const grammarDigest = (extension: string): string => {
    const cached = digestCache.get(extension);
    if (cached !== undefined) return cached;
    const digest = createHash('sha256').update(`web-tree-sitter:${runtimeIdentity()}\ngrammar:${grammarWasmHash(extension)}`).digest('hex');
    digestCache.set(extension, digest);
    return digest;
  };

  return {
    runtimeIdentity,
    getParser,
    async loadGrammarsFor(extensions) {
      const seen = new Set<string>();
      for (const ext of extensions) {
        const wasmFile = grammarFor(ext);
        if (wasmFile === undefined || seen.has(wasmFile)) continue;
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
    async withParsedFile(filePath, content, fn, language, options) {
      const tree = await parseFile(filePath, content, language, options);
      try {
        return await fn(tree);
      } finally {
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
