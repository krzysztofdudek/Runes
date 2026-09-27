/**
 * What the guard looks for. The defaults describe the Yggdrasil family as of this release; every list is data, so a consumer extends or narrows it without touching the analyser.
 */

/** One family tool: how code could reach it. */
export interface GuardTool {
  /** Canonical tool name, used by `self` and `edges`. */
  name: string;
  /** Executable names. A spawned or executed command whose first word or any argument word has one of these as its basename (extension dropped) reaches the tool. */
  commands: string[];
  /** npm package names. An import of the package or any of its subpaths reaches the tool. */
  packages: string[];
  /** Module names. A relative or bare import with a path segment of this name (extension dropped) reaches the tool. */
  modules: string[];
  /** State directories, as they appear in a path. A string literal holding one as a path segment builds a path into the tool's state. */
  stateDirs: string[];
}

/** A domain word that must not appear in an exported identifier. */
export interface DomainTerm {
  /** The word, lower case. Its plural with -s or -es matches too. */
  word: string;
  /** Qualifier words that make the use generic: an identifier that also contains one of these is not flagged for this term. */
  unless?: string[];
}

export interface GuardConfig {
  tools: GuardTool[];
  /** The tool whose own repository is being scanned; it may reach itself. */
  self?: string;
  /** Tools this code is allowed to reach: the declared dependency edges of the scanned tool. */
  edges?: string[];
  /** Words that no exported identifier may carry. An empty list turns the check off. */
  domainWords: DomainTerm[];
  /** File extensions to scan. */
  extensions: string[];
  /** Directory names never entered. */
  skipDirs: string[];
}

export const FAMILY_TOOLS: GuardTool[] = [
  { name: 'yggdrasil', commands: ['yg', 'yggdrasil'], packages: ['@chrisdudek/yg'], modules: ['yg', 'yggdrasil'], stateDirs: ['.yggdrasil'] },
  { name: 'grain', commands: ['grain'], packages: ['@chrisdudek/grain'], modules: ['grain'], stateDirs: ['.grain'] },
  { name: 'jarl', commands: ['jarl'], packages: ['@chrisdudek/jarl'], modules: ['jarl'], stateDirs: ['.jarl'] },
  { name: 'horde', commands: ['horde'], packages: ['@chrisdudek/horde'], modules: ['horde'], stateDirs: ['.horde'] },
];

/**
 * The starting list of family domain words. `node` means a graph node; tree-sitter code speaks of syntax nodes all the time, so an identifier that also says syntax, ast, tree, sitter, parse, parser or walk is taken as the generic sense.
 */
export const DEFAULT_DOMAIN_WORDS: DomainTerm[] = [
  { word: 'node', unless: ['syntax', 'ast', 'tree', 'sitter', 'parse', 'parser', 'walk'] },
  { word: 'aspect' },
  { word: 'horde' },
  { word: 'jarl' },
  { word: 'ticket' },
  { word: 'mission' },
  { word: 'loop' },
];

export const DEFAULT_GUARD_CONFIG: GuardConfig = {
  tools: FAMILY_TOOLS,
  domainWords: DEFAULT_DOMAIN_WORDS,
  extensions: ['.mts', '.ts', '.cts', '.tsx', '.mjs', '.js', '.cjs', '.jsx'],
  skipDirs: ['node_modules', '.git', 'dist'],
};

/** Returns the default configuration with the given fields replaced. */
export function guardConfig(overrides: Partial<GuardConfig> = {}): GuardConfig {
  return { ...DEFAULT_GUARD_CONFIG, ...overrides };
}
