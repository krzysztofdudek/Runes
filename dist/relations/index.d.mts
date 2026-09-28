/**
 * @chrisdudek/runes/relations
 *
 * Relation extraction: per-language extractors that turn a syntax tree into declared symbols and ordered candidate groups, the symbol table, the three-state resolver (resolved, ambiguous, absent), and per-language path resolution against the files on disk. Files are grouped by an injected owner lookup; Runes never knows what an owner is.
 *
 * This index is the stable 1.x surface (docs/api.md), and it holds only what a family tool imports today. A language's extractor is reached through `extractorForLanguage`; only `csharpExtractor` is exported by name, because a consumer imports it. The per-language resolution helpers behind `makeResolvePathToFile` and the extractors are internal: they stay in their modules and may change in any release.
 */
export { RUNES_VERSION as version } from '../version.mjs';
export type { DepKind, TargetHint, SymbolSetMember, DetectedDep, DeclaredSymbol, ParsedFile, DependencyExtractor } from './extractors/types.mjs';
export { extractorForLanguage } from './extractors/registry.mjs';
export { sfcScriptView, type SfcScriptView } from './extractors/typescript.mjs';
export { parsePsr4 } from './extractors/php-resolve.mjs';
export { includeUses } from './extractors/c-cpp-shared.mjs';
export { csharpExtractor, extractCsharpRefs, assembleCsharpCandidates, type CsharpExtract, type CsharpRefDescriptor, type CsharpUsesOptions } from './extractors/csharp.mjs';
export { buildCsharpProjectScopes, type CsharpGlobalFacts, type CsharpProjectScope } from './extractors/csharp-project.mjs';
export { SymbolTable } from './symbol-table.mjs';
export { makeResolver, resolveDetectedEdges, type OwnerLookup, type ResolvedTarget, type ResolverDeps, type Classification, type TargetResolver } from './resolver.mjs';
export { makeResolvePathToFile } from './resolve-path.mjs';
