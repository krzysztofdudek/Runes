import { type IncludeRoots } from './extractors/include-resolve.mjs';
import { type ComposerAutoload } from './extractors/php-resolve.mjs';
import { type FileSource } from './file-view.mjs';
import { type DiagnosticSink } from './diagnostics.mjs';
export interface RepoLayout {
    /** C/C++ include-root capabilities for `resolveIncludePath`. */
    includeRoots: IncludeRoots;
    /** Every in-repo composer.json's autoload maps (repo-rel dirs), in walk order. */
    composerMaps(): readonly ComposerAutoload[];
    /** The Ruby load-path roots of the repository (repo-rel dirs): `lib`, then each `require_paths` entry of every in-repo gemspec, joined to the gemspec's directory, in walk order and without repeats. */
    rubyLoadRoots(): readonly string[];
}
export declare function makeRepoLayout(projectRoot: string, files: FileSource, isExcluded?: (repoRelPosix: string) => boolean, report?: DiagnosticSink): RepoLayout;
