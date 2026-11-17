/** The configurations whose module aliases are read: Vite's `resolve.alias` (and Vitest's `test.alias` in the same file), webpack's `resolve.alias`, and the `alias` option of Babel's module-resolver plugin. */
export type BundlerKind = 'vite' | 'webpack' | 'babel';
/** The configuration files read, by name, and the bundler each belongs to. */
export declare const BUNDLER_CONFIG_FILES: ReadonlyArray<readonly [string, BundlerKind]>;
/** What an alias does with a specifier it matches: names a repository path (repo-relative POSIX, `''` the root), hands on another bare request, or does what the reader cannot tell. */
export type AliasAnswer = {
    kind: 'path';
    path: string;
} | {
    kind: 'request';
    request: string;
} | {
    kind: 'unknown';
};
/** One alias in the order the bundler tries it. `find` undefined: a key the reader cannot read (a regular expression, a computed key, a spread), which may match any specifier. */
export interface AliasEntry {
    find?: string;
    exact: boolean;
    replacement: AliasAnswer;
}
/**
 * The aliases a bundler configuration defines, read from its text without running it: one list per `alias` property found, each in the order the bundler tries its keys. `'unknown'` when the text holds an alias the reader cannot follow, so any bare specifier may be mapped: an `alias` anywhere but as a literal object (or, for Vite, a literal array of `{ find, replacement }`) under `resolve` (Vite also `test`) of a configuration object that no other object holds, or in the options of module-resolver in the `plugins` of such an object; module-resolver referenced in any other way, with a `root`, `cwd` or `resolvePath` option, or with options it cannot read; or text the token reader cannot balance. A list is one unknown entry when the alias object, the `resolve` (or `test`) object or the configuration object holds a member that may replace a key the lookup reads: a spread, a computed or escaped key, a method or accessor, a key written twice, or a shorthand of the name the lookup reads.
 *
 * A replacement counts only in these forms; any other is an alias whose key is known and whose target is not:
 * - `path.resolve(__dirname, '<p>', …)` and `path.join(__dirname, '<p>', …)`, with `path` imported from Node's `path` and no `__dirname` declared by the file, and `fileURLToPath(new URL('<p>', import.meta.url))`: `<p>` from the configuration's directory;
 * - a string: for Vite one starting with `/` from the project root, the configuration's directory (unless the file sets a `root`); for Babel one starting with `./` or `../` from module-resolver's working directory, which the reader takes to be the configuration's directory, where Babel runs; for all three a bare string is another request, as the bundler reads it. Vite and webpack resolve a relative string from the importing file, so it is not read.
 */
export declare function readBundlerAliases(text: string, kind: BundlerKind, configDir: string): AliasEntry[][] | 'unknown';
/** What the aliases make of a bare specifier: the first entry that matches decides, an entry with an unreadable key matches anything, and undefined is no match. */
export declare function applyBundlerAliases(spec: string, entries: AliasEntry[]): AliasAnswer | undefined;
/** More alias lists than any configuration writes by hand: a file with more is not read, so a crafted one cannot make each import slow. */
export declare const MAX_ALIAS_LISTS = 64;
/** The aliases of the configurations one directory holds, indexed by key, so an import costs the number of lists times the segments of its specifier, whatever the number of keys. Answers are remembered by specifier. */
export interface AliasTable {
    lookup(spec: string): AliasAnswer | undefined;
}
/** The {@link AliasTable} of alias lists that all apply, one list `'unknown'` where a configuration cannot be read; above {@link MAX_ALIAS_LISTS} lists it answers unknown for every specifier. */
export declare function makeAliasTable(lists: Array<AliasEntry[] | 'unknown'>): AliasTable;
/** One answer from several alias lists that may all apply: none matching is no match, matches that agree are the answer, matches that differ are unknown. */
export declare function combineAliasAnswers(answers: Array<AliasAnswer | undefined>): AliasAnswer | undefined;
