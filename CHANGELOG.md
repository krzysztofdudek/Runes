# Changelog

All notable changes to Runes are recorded here, one line per change. Runes follows [Semantic Versioning](https://semver.org/); one version covers every subpath.

## [0.1.2] - 2026-09-27

- Windows: the guard reads CRLF sources (a string continued across a CRLF line break no longer ends early) and backslash paths, `check:dist` rebuilds without spawning `npm.cmd`, the vendor tool retries removing a clone Windows still holds open, and CI runs the suite on `windows-latest` with Node 22 and 24.
- `grammars`: `buildGrammars` refuses a source build on Windows before any download and says why: the wasi-sdk tree-sitter-cli 0.27.0 fetches there labels its clang `23.1.0-rc3` in the WASM `producers` section (Linux and macOS: `23.1.0-wasi-sdk`, same LLVM commit), so the code is identical but the sha256 never matches the pin. On Windows the source-built grammars come from a cache filled on Linux, macOS or WSL; CI's Windows jobs read the Ubuntu `grammars` job's cache offline. New option `platform` (default `process.platform`).

## [0.1.1] - 2026-09-27

- `tools/vendor.mjs`: the unvendored-import check skips comments, so an import quoted in a comment (as in `dist/relations/extractors/typescript.mjs`) no longer fails `check` for a consumer that vendors `dist/relations`; strings, template literals and regular expressions are kept, so a `//` inside them hides no real import.

## [0.1.0] - 2026-09-27

- First release: the package with the subpaths `relations`, `ast`, `grammars`, `fs`, `cli`, `mcp` and `testkit`, each carrying code (below).
- `fs`: `withLock` and `withLockAsync`, a cross-process lock on one file (pid, host and age; stale locks broken behind a serialised `.break` file; `LockHeldError` within `waitMs`, `LockBreakError` at once when a stale lock cannot be removed); `writeAtomic` with a rename retried on Windows EPERM/EACCES/EBUSY; `findRoot` and friends, the repository root through the git common dir, with a marker that sends a worktree to its main checkout.
- `cli`: the command table (`defineTable`: arguments, flag kinds, subcommands, aliases, path fields, write and destructive marks), `parseArgs` driven by it, the `<tool>-error/1` document with `CliError` and `UsageError`, the one-block `--json` rule (`renderResult`, `renderFailure`, `emit`), and `readUsage` for a hand-written usage text.
- `mcp`: a stdio MCP server generated from the table (`createServer`, `serveStdio`) with an in-process executor and a spawn executor; version negotiation, -32602 on input that does not fit, absolute path fields, one JSON block with notes in `_meta`, annotations from the table, `transformInput`/`transformArgv` hooks, per-call timeout and cancel that kill the spawned process tree (`taskkill /T /F` on Windows), `ping` and `tools/list` never queued behind a call, client responses ignored, and SIGTERM/SIGINT/SIGHUP handled.
- `testkit`: `gitEnv` and `makeTempRepo` (git's repository-locating variables cleared, `maintenance.auto=false`, `gc.auto=0`, no user or system config, fixed identity and dates), `parityProblems`/`assertParity` between the table, the usage text and the MCP tools, `measureTools` with a budget warning, and a stdio MCP test client.
- `skills/`: the first shared fragments, `mcp-first`, `worker-worktree` and `evidence`.
- `testkit`: the family guard, which fails when code imports another family tool, runs its executable, builds a path into its state directory, or exports an identifier carrying a family domain word; with a reviewed allow file.
- `relations`: moved from Yggdrasil: the extractors of 11 languages, the symbol table, the three-state resolver (`ownerNode` is now `owner`; the owner lookup is an injected `{ ownerOf(file) }`), `makeResolvePathToFile` (without Yggdrasil's graph-bound wrapper) and the repository layout. `ParsedFile.newParser` injects the parser Kotlin recovery needs.
- `ast`: `walk`, `closest`, the parse cache, and `createParserHost`, a parser host over an injected `web-tree-sitter` runtime and runtime identity; no module imports the runtime by value.
- `grammars`: the grammar manifest format and its validator; the manifest pins the union of Yggdrasil's and Grain's grammars (23), the runtime and `tree-sitter-cli` 0.27.0; the four TypeScript patches; `buildGrammars` (fetch, patch, build, sha256-verify, content-addressed cache, `only`) and `verifyGrammarFiles`; the language table. PHP is the `php` grammar, not `php_only`. The manifest format gained `runtime.wasmSha256`, `cli`, source builds with `dir`, `generate`, `patches` and `deps`, and npm sources with `wasmPath` and `nodeTypesPath`.
- `testkit`: `checkRuntimePins`, which fails a consumer whose `web-tree-sitter` or npm grammar packages differ from the manifest, or whose `web-tree-sitter.wasm` differs from the pinned sha256.
- The 460-case relation catalogue (`reference/relations/`) with its runner, and the extractor, symbol-table, resolver, path, registry, candidate-parity, C# parity and extractor-rev tests, moved from Yggdrasil.
- `tools/vendor.mjs`: the vendoring tool consumers copy, with an offline sha256 gate, a fresh-clone gate for CI, `update` between tags, a local report for co-development, and skill fragments between markers.
