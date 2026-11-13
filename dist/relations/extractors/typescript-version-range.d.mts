/**
 * Whether the TypeScript Runes models satisfies the range a package.json `exports` key `types@<range>` names, as the compiler decides it (`isApplicableVersionedTypesKey` reading its own `VersionRange`): `||` alternatives of space-separated comparators, `A - B` hyphen ranges, `~` and `^`, x-ranges and the primitives `<`, `<=`, `>`, `>=` and `=`, with prerelease tags counting as they do in `satisfies(..., { includePrerelease: true })`. A range the compiler does not parse (an operator separated from its version by a space, a version of four parts, any word) satisfies nothing, which is what makes the compiler skip the key. The empty range satisfies every version.
 *
 * Runes does not run the compiler and does not read which one a project uses: the version is TypeScript 7, the one the family pins and the catalogue cites, for every project (the owner's ruling for Runes 1.1.0).
 */
export declare const MODELLED_TYPESCRIPT_VERSION = "7.0.2";
export declare function typeScriptSatisfies(range: string): boolean;
