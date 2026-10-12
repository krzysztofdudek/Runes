import type { FileSource } from '../file-view.mjs';
/**
 * The MSBuild reading shared by the two C# project readers: the global-using scoping (`csharp-project.mts`) and the reference graph (`csharp-reach.mts`). Internal: nothing here is exported from the package.
 *
 * The XML reading is deliberately narrow (start tags, a few properties) and never evaluates a condition or a property.
 */
/** The attributes of one XML start tag's attribute text, keys lower-cased. */
export declare function attributes(attrText: string): Map<string, string>;
/** The text with XML comments removed. */
export declare function stripComments(xml: string): string;
/** The last value of `<Name>value</Name>` in the text, or undefined. */
export declare function lastProperty(xml: string, name: string): string | undefined;
/** True for the name of a C# project file. */
export declare function isCsproj(name: string): boolean;
/** What the readers need to find a file's project and the MSBuild files above it, over one file source. */
export interface ProjectLocator {
    /** The sorted names inside `dir` (memoized); empty when `dir` is not a directory of the source. */
    list(dir: string): string[];
    /** `dir` and its ancestors up to the root (`.`), nearest first. */
    ancestors(dir: string): string[];
    /** The directory of the project a file belongs to: the nearest ancestor directory (the file's own included) that holds a `.csproj`; null when there is none. */
    projectDirOf(file: string): string | null;
    /** The nearest file called `basename` in `dir` or an ancestor, or undefined. */
    nearestFile(dir: string, basename: string): string | undefined;
}
/** The locator over one file source. */
export declare function makeProjectLocator(source: FileSource): ProjectLocator;
