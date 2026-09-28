/** The directory listing a case check needs; `node:fs` by default, replaceable so a test can stand in a case-insensitive file system on any host. */
export interface ExactCaseFs {
    readdirSync(dir: string): string[];
}
/**
 * Returns a check that a repository-relative POSIX path is spelled, segment by segment, the way its directories list it.
 *
 * On a case-insensitive file system (the macOS and Windows defaults) `existsSync('lib/Root.rs')` is true when only `lib/root.rs` exists, so a resolver probing a module path would take a file under a name it does not have and report an edge to it. A probe that passed `existsSync` is confirmed here against the names `readdirSync` returns; on a case-sensitive file system the answer is always the same as the probe's. Names are compared after NFC normalisation, so a file stored decomposed (as macOS may store it) still matches a specifier written composed.
 *
 * A path that leaves the project root, or is absolute, is not checked (the answer is `true`): only segments under the root are compared. Each directory is listed at most once per check instance, so one instance belongs to one resolution pass, like the resolver's other caches.
 */
export declare function makeExactCaseCheck(projectRoot: string, fs?: ExactCaseFs): (repoRelPosix: string) => boolean;
