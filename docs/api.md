# Runes 1.x: the stable API

This is what `@chrisdudek/runes` promises under semantic versioning from 1.0.0 on. A name listed here keeps its meaning and its signature for every 1.x release: a minor release may add names, options and fields, a patch release fixes behaviour to match what the README says, and anything that breaks a listed name waits for 2.0.0. A test (`test/exports.test.mjs`) holds this page and the package's exports together both ways, so a name exported without being listed here, or listed without being exported, fails the build.

## What the promise covers

- **The names below**, from the seven subpaths, with the behaviour the README documents for them. Types are part of it: a type listed here keeps its fields (a minor release may add optional ones).
- **The module files a vendoring consumer imports** without going through an index: `dist/version.mjs`, `dist/<subpath>/index.mjs` for each subpath, and in the test kit `dist/testkit/parity.mjs`, `dist/testkit/measure.mjs`, `dist/testkit/client.mjs` and `dist/testkit/runtime/index.mjs`, each with the names it exports today. A vendored copy takes whole directories or these files, so these paths are the vendoring surface; every other file under `dist/` may move in any release.
- **The documents and formats**: the `<tool>-error/1` error document; the grammar manifest (`grammars/manifest.json`, its schema id); the vendoring pin (`runes.pin.json`), the commands, options and exit codes of `tools/vendor.mjs`, and the skill fragment names and markers.
- **The MCP wire shape** the adapter generates: tool names, one field per argument and flag with its type, which fields are required, what the annotations mean, one JSON block with notes in `_meta`, -32602 for input that does not fit, cancellation and time limits.

## What it does not cover

- Every export of an internal module. The per-language resolution helpers, the lock's staleness test, the table's helper functions, the usage-text reader, the guard's scanner and the git environment's constants stay in their modules for Runes' own tests; they may change in any release.
- Wording: error messages, tool and field descriptions, report lines. Codes (`code` in the error document, `ELOCKED`, `ELOCKBREAK`, `usage`) are stable; sentences are not.
- The exact edges an extractor finds. An extractor fix changes what it reports for some source, in a minor or a patch release; the extractor's `rev` changes with it, so a consumer's cache keyed by `rev` drops what it computed before. The relation catalogue (`reference/relations/`) is the specification that fixes move towards.

The Consumers column names the family tools that import each name on their `release/6.1.0` branches (a vendored copy counts), found by reading their imports; "—" means none does yet, and the name is kept because the README documents it as part of the subpath's job.

## `@chrisdudek/runes/relations`

Relation extraction. Each language's extractor (also reached through `extractorForLanguage`) turns a parsed file into declared symbols and ordered candidate groups; `SymbolTable`, `makeResolver` and `resolveDetectedEdges` resolve them in three states; `makeResolvePathToFile` resolves specifiers against the files on disk. The C# project facts (`extractCsharpRefs`, `buildCsharpProjectScopes`, `assembleCsharpCandidates`), `includeUses`, `parsePsr4` and `sfcScriptView` are the pieces a consumer that runs its own pass (Grain) composes.

| Export | Kind | Consumers |
|---|---|---|
| `version` | value | Yggdrasil |
| `DepKind` | type | — |
| `TargetHint` | type | — |
| `SymbolSetMember` | type | — |
| `DetectedDep` | type | Yggdrasil |
| `DeclaredSymbol` | type | Yggdrasil |
| `ParsedFile` | type | Yggdrasil |
| `DependencyExtractor` | type | Yggdrasil |
| `extractorForLanguage` | value | Grain, Yggdrasil |
| `typescriptExtractor` | value | — |
| `sfcScriptView` | value | Grain, Yggdrasil |
| `SfcScriptView` | type | — |
| `pythonExtractor` | value | — |
| `goExtractor` | value | — |
| `javaExtractor` | value | — |
| `kotlinExtractor` | value | — |
| `phpExtractor` | value | — |
| `parsePsr4` | value | Grain |
| `rustExtractor` | value | — |
| `rubyExtractor` | value | — |
| `cExtractor` | value | — |
| `cppExtractor` | value | — |
| `includeUses` | value | Grain |
| `csharpExtractor` | value | Yggdrasil |
| `extractCsharpRefs` | value | Grain, Yggdrasil |
| `assembleCsharpCandidates` | value | Grain, Yggdrasil |
| `CsharpExtract` | type | Yggdrasil |
| `CsharpRefDescriptor` | type | — |
| `CsharpUsesOptions` | type | — |
| `buildCsharpProjectScopes` | value | Grain, Yggdrasil |
| `CsharpGlobalFacts` | type | Yggdrasil |
| `CsharpProjectScope` | type | — |
| `SymbolTable` | value | Grain, Yggdrasil |
| `makeResolver` | value | Grain, Yggdrasil |
| `resolveDetectedEdges` | value | Yggdrasil |
| `OwnerLookup` | type | — |
| `ResolvedTarget` | type | — |
| `ResolverDeps` | type | — |
| `Classification` | type | — |
| `TargetResolver` | type | — |
| `makeResolvePathToFile` | value | Grain, Yggdrasil |

## `@chrisdudek/runes/ast`

`walk` and `closest` over syntax nodes, the parse cache, and the parser host over an injected `web-tree-sitter` runtime.

| Export | Kind | Consumers |
|---|---|---|
| `version` | value | Yggdrasil |
| `walk` | value | Yggdrasil |
| `closest` | value | Yggdrasil |
| `destroyParseCache` | value | Yggdrasil |
| `ParseCache` | type | Yggdrasil |
| `createParserHost` | value | Yggdrasil |
| `fileSha256` | value | Yggdrasil |
| `ParserHost` | type | — |
| `ParserHostOptions` | type | — |
| `TreeSitterRuntime` | type | — |

## `@chrisdudek/runes/grammars`

The grammar manifest and its recipe (`buildGrammars`, `verifyGrammarFiles`, `loadGrammarManifest`) and the language table.

| Export | Kind | Consumers |
|---|---|---|
| `version` | value | Yggdrasil |
| `GrammarManifest` | type | — |
| `GrammarPin` | type | — |
| `GrammarSource` | type | — |
| `buildGrammars` | value | Grain, Yggdrasil |
| `verifyGrammarFiles` | value | Grain, Yggdrasil |
| `loadGrammarManifest` | value | Grain, Yggdrasil |
| `BuildGrammarsOptions` | type | — |
| `BuiltGrammar` | type | — |
| `GrammarFileProblem` | type | — |
| `LANGUAGES` | value | Yggdrasil |
| `EXTENSION_TO_LANGUAGE` | value | Yggdrasil |
| `grammarExtensionForPath` | value | Yggdrasil |
| `getLanguageForExtension` | value | Yggdrasil |
| `relationLanguageForPath` | value | Yggdrasil |
| `primaryExtensionForLanguage` | value | Yggdrasil |
| `getGrammarForExtension` | value | Yggdrasil |
| `getLanguageDisplayName` | value | Yggdrasil |
| `LanguageDef` | type | Yggdrasil |

## `@chrisdudek/runes/fs`

The cross-process lock, atomic writes and the repository root. No consumer imports it yet; it is kept because the family design moves the tools' locks onto it, and its behaviour is specified and tested (README, `fs`).

| Export | Kind | Consumers |
|---|---|---|
| `version` | value | — |
| `withLock` | value | — |
| `withLockAsync` | value | — |
| `LockHeldError` | value | — |
| `LockBreakError` | value | — |
| `LockDirectoryMissingError` | value | — |
| `LockOptions` | type | — |
| `writeAtomic` | value | — |
| `renameWithRetry` | value | — |
| `WriteAtomicOptions` | type | — |
| `RenameOptions` | type | — |
| `findRoot` | value | — |
| `checkoutRoot` | value | — |
| `mainCheckout` | value | — |
| `gitCommonDir` | value | — |
| `isLinkedWorktree` | value | — |
| `FindRootOptions` | type | — |

## `@chrisdudek/runes/cli`

The command table and the CLI side of it: `parseArgs`, the `<tool>-error/1` document (`CliError`, `UsageError`, `errorDocument`) and the one-block `--json` rule (`renderResult`, `renderFailure`, `emit`, `isSingleJsonBlock`). Consumers build their table with `defineTable` today; `CliError` and `ParsedArgs` are also what an in-process MCP executor throws and receives.

| Export | Kind | Consumers |
|---|---|---|
| `version` | value | — |
| `defineTable` | value | Grain, Horde, Jarl |
| `CommandTable` | type | — |
| `CommandSpec` | type | — |
| `FlagKind` | type | — |
| `parseArgs` | value | — |
| `ParsedArgs` | type | — |
| `ParseOptions` | type | — |
| `FlagValue` | type | — |
| `CliError` | value | — |
| `UsageError` | value | — |
| `errorDocument` | value | — |
| `ErrorDocument` | type | — |
| `CliErrorOptions` | type | — |
| `renderResult` | value | — |
| `renderFailure` | value | — |
| `emit` | value | — |
| `isSingleJsonBlock` | value | — |
| `CommandResult` | type | — |
| `Rendered` | type | — |
| `FailureOptions` | type | — |
| `Streams` | type | — |

## `@chrisdudek/runes/mcp`

The MCP server generated from a table, its two executors, the stdio transport, and the pieces a consumer with its own message handler reuses (`buildTools`, `argvFor`, `answersJson`, `commandForTool`, `toolName`, `InvalidParams`).

| Export | Kind | Consumers |
|---|---|---|
| `version` | value | — |
| `buildTools` | value | Grain, Horde, Jarl |
| `argvFor` | value | Grain, Jarl |
| `answersJson` | value | Grain |
| `commandForTool` | value | Jarl |
| `toolName` | value | Horde |
| `InvalidParams` | value | Grain, Jarl |
| `McpTool` | type | — |
| `ToolOptions` | type | — |
| `createServer` | value | Grain, Horde |
| `serveStdio` | value | Grain, Horde, Jarl |
| `inProcess` | value | — |
| `spawnCli` | value | Grain, Horde |
| `PROTOCOL_VERSION` | value | Grain, Jarl |
| `PROTOCOL_VERSIONS` | value | Grain, Jarl |
| `ServerOptions` | type | — |
| `McpServer` | type | — |
| `Concurrency` | type | — |
| `Executor` | type | — |
| `InProcessExecutor` | type | — |
| `SpawnExecutor` | type | — |
| `CallContext` | type | — |
| `PrepareResult` | type | — |
| `ToolResult` | type | — |
| `StdioOptions` | type | — |
| `StdioHandle` | type | — |
| `JsonRpcMessage` | type | — |
| `JsonRpcReply` | type | — |
| `killTree` | value | Grain |
| `KillOptions` | type | — |

## `@chrisdudek/runes/testkit`

The family guard, the git test environment, parity between table, usage and tools, `tools/list` measurement, the stdio MCP test client, and the runtime pin check.

| Export | Kind | Consumers |
|---|---|---|
| `version` | value | — |
| `runGuard` | value | Yggdrasil |
| `guardPassed` | value | Yggdrasil |
| `formatGuardReport` | value | Yggdrasil |
| `guardConfig` | value | Yggdrasil |
| `DEFAULT_DOMAIN_WORDS` | value | Yggdrasil |
| `tokenize` | value | Yggdrasil |
| `GuardOptions` | type | — |
| `GuardReport` | type | — |
| `GuardConfig` | type | — |
| `GuardTool` | type | — |
| `DomainTerm` | type | — |
| `GuardFinding` | type | — |
| `GuardRule` | type | — |
| `Token` | type | — |
| `TokenType` | type | — |
| `gitEnv` | value | — |
| `makeTempRepo` | value | — |
| `GitEnvOptions` | type | — |
| `TempRepo` | type | — |
| `parityProblems` | value | Grain, Horde, Jarl |
| `assertParity` | value | Grain, Horde, Jarl |
| `ParityOptions` | type | — |
| `UsageOptions` | type | — |
| `measureTools` | value | Grain, Horde, Jarl |
| `formatToolsMeasure` | value | Grain, Horde, Jarl |
| `ToolsMeasure` | type | — |
| `MeasureOptions` | type | — |
| `startMcpClient` | value | Horde |
| `listToolsOverStdio` | value | Grain, Horde, Jarl |
| `McpTestClient` | type | — |
| `ClientOptions` | type | — |
| `checkRuntimePins` | value | Grain, Yggdrasil |
| `formatRuntimePinReport` | value | Grain, Yggdrasil |
| `RuntimePinOptions` | type | — |
| `RuntimePinProblem` | type | — |

## Removed in 1.0.0

These were exported in 0.1.x and no consumer imported them. They are internal from 1.0.0 on (the code stays where Runes itself uses it):

- `relations`: `subpath`, `single`, `makeRepoLayout`, `makeExactCaseCheck`, `resolveCandidateGroup`, `collectGlobalUsings`, `collectGlobalUsingAliases`, `csharpUses`, `deadPreprocessorLines`, `evalPreprocessorCondition`, `kotlinView`, `isRubyExternalConstant`, `rubyUnderscore`, `makeTsResolveDeps`, `parseJsonc`, `parseCargoManifest`, `parseCompileCommands`, `parseComposerAutoload`, `parseGoModulePath`, `parseGoWorkUses`, `resolveGoImport`, `resolveIncludePath`, `resolveJavaFqn`, `resolveJavaPackageFiles`, `resolvePhpFqn`, `resolvePythonModule`, `resolveRubyRequireRelative`, `resolveRustPath`, `resolveTsPath`, `rustFileDeclares`, `rustTargetFor`, and the types that only these took.
- `ast`: `subpath`.
- `grammars`: `subpath`, `GRAMMAR_MANIFEST_SCHEMA`, `validateGrammarManifest`, `parseGrammarManifest`, `syntaxNodeTypesFile`, `shippedGrammarsDir`.
- `fs`: `subpath`, `lockIsStale`, `lockHolderText`, `pidRuns`, `LOCK_DEFAULTS`, `transientRenameCodes`, `tempPathFor`.
- `cli`: `subpath`, `tableProblems`, `argSpec`, `commandFlags`, `pathFields`, `publicCommands`, `resolveCommand`, `errorSchema`, `errorParts`, `formatError`, `commandArgv`, `jsonBlock`, `readUsage` (with `ArgSpec`, `UsageBlock`, `UsageReading`; `UsageOptions` moved to `testkit`, where `ParityOptions` takes it).
- `mcp`: `subpath`, `prefixOf`, `toolFlags`, `requireParam`, `runProcess` (with `RunOptions`, `RunOutcome`).
- `testkit`: `subpath`, `FAMILY_TOOLS`, `DEFAULT_GUARD_CONFIG`, `scanSource`, `listExports`, `importSpecifiers`, `identifierWords`, `domainWordsIn`, `parseAllow`, `allowMatches`, `gitLocalEnvVars`, `TEST_GIT_CONFIG`, `GIT_LOCAL_ENV_FALLBACK` (with `ExportedName`, `AllowEntry`).
