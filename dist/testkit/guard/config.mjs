/**
 * What the guard looks for. The defaults describe the Yggdrasil family as of this release; every list is data, so a consumer extends or narrows it without touching the analyser.
 */
export const FAMILY_TOOLS = [
    { name: 'yggdrasil', commands: ['yg', 'yggdrasil'], packages: ['@chrisdudek/yg'], modules: ['yg', 'yggdrasil'], stateDirs: ['.yggdrasil'] },
    { name: 'grain', commands: ['grain'], packages: ['@chrisdudek/grain'], modules: ['grain'], stateDirs: ['.grain'] },
    { name: 'jarl', commands: ['jarl'], packages: ['@chrisdudek/jarl'], modules: ['jarl'], stateDirs: ['.jarl'] },
    { name: 'horde', commands: ['horde'], packages: ['@chrisdudek/horde'], modules: ['horde'], stateDirs: ['.horde'] },
];
/**
 * The starting list of family domain words. `node` means a graph node; tree-sitter code speaks of syntax nodes all the time, so an identifier that also says syntax, ast, tree, sitter, parse, parser or walk is taken as the generic sense.
 */
export const DEFAULT_DOMAIN_WORDS = [
    { word: 'node', unless: ['syntax', 'ast', 'tree', 'sitter', 'parse', 'parser', 'walk'] },
    { word: 'aspect' },
    { word: 'horde' },
    { word: 'jarl' },
    { word: 'ticket' },
    { word: 'mission' },
    { word: 'loop' },
];
export const DEFAULT_GUARD_CONFIG = {
    tools: FAMILY_TOOLS,
    domainWords: DEFAULT_DOMAIN_WORDS,
    extensions: ['.mts', '.ts', '.cts', '.tsx', '.mjs', '.js', '.cjs', '.jsx'],
    skipDirs: ['node_modules', '.git', 'dist'],
};
/** Returns the default configuration with the given fields replaced. */
export function guardConfig(overrides = {}) {
    return { ...DEFAULT_GUARD_CONFIG, ...overrides };
}
