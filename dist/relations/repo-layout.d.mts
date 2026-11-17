import { type IncludeRoots } from './extractors/include-resolve.mjs';
import { type ComposerAutoload } from './extractors/php-resolve.mjs';
import { type RubyLoadPath } from './extractors/ruby-resolve.mjs';
import { type FileSource } from './file-view.mjs';
import { type DiagnosticSink } from './diagnostics.mjs';
export interface RepoLayout {
    /** C/C++ include-root capabilities for `resolveIncludePath`. */
    includeRoots: IncludeRoots;
    /** Every in-repo composer.json's autoload maps (repo-rel dirs), in walk order. */
    composerMaps(): readonly ComposerAutoload[];
    /** The Ruby load path for `resolveRubyRequire`: for a requiring file, `lib`, each `require_paths` entry of every in-repo gemspec joined to the gemspec's directory (of a gemspec under a test or fixture directory, only for files under the gemspec's own directory), and each `spec` or `test` directory the file lies in. */
    rubyLoadPath: RubyLoadPath;
}
export declare function makeRepoLayout(projectRoot: string, files: FileSource, isExcluded?: (repoRelPosix: string) => boolean, report?: DiagnosticSink): RepoLayout;
