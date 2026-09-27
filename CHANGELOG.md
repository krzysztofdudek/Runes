# Changelog

All notable changes to Runes are recorded here, one line per change. Runes follows [Semantic Versioning](https://semver.org/); one version covers every subpath.

## [0.1.0] - 2026-09-27

- First release: the package with the subpaths `relations`, `ast`, `grammars`, `fs`, `cli`, `mcp` and `testkit`. `relations` and `ast` are still stubs; the relation extractor and the syntax-tree walker move in with a later release.
- `fs`: `withLock` and `withLockAsync`, a cross-process lock on one file (pid, host and age; stale locks broken behind a serialised `.break` file; `LockHeldError` within `waitMs`, `LockBreakError` at once when a stale lock cannot be removed); `writeAtomic` with a rename retried on Windows EPERM/EACCES/EBUSY; `findRoot` and friends, the repository root through the git common dir, with a marker that sends a worktree to its main checkout.
- `cli`: the command table (`defineTable`: arguments, flag kinds, subcommands, aliases, path fields, write and destructive marks), `parseArgs` driven by it, the `<tool>-error/1` document with `CliError` and `UsageError`, the one-block `--json` rule (`renderResult`, `renderFailure`, `emit`), and `readUsage` for a hand-written usage text.
- `mcp`: a stdio MCP server generated from the table (`createServer`, `serveStdio`) with an in-process executor and a spawn executor; version negotiation, -32602 on input that does not fit, absolute path fields, one JSON block with notes in `_meta`, annotations from the table, `transformInput`/`transformArgv` hooks, per-call timeout and cancel that kill the spawned process tree (`taskkill /T /F` on Windows), `ping` and `tools/list` never queued behind a call, client responses ignored, and SIGTERM/SIGINT/SIGHUP handled.
- `testkit`: `gitEnv` and `makeTempRepo` (git's repository-locating variables cleared, `maintenance.auto=false`, `gc.auto=0`, no user or system config, fixed identity and dates), `parityProblems`/`assertParity` between the table, the usage text and the MCP tools, `measureTools` with a budget warning, a stdio MCP test client, and `runtimePinProblems`.
- `skills/`: the first shared fragments, `mcp-first`, `worker-worktree` and `evidence`.
- `testkit`: the family guard, which fails when code imports another family tool, runs its executable, builds a path into its state directory, or exports an identifier carrying a family domain word; with a reviewed allow file.
- `grammars`: the grammar manifest format, with the `web-tree-sitter` runtime pinned to 0.27.0, and its validator. No grammars are pinned yet.
- `tools/vendor.mjs`: the vendoring tool consumers copy, with an offline sha256 gate, a fresh-clone gate for CI, `update` between tags, a local report for co-development, and skill fragments between markers.
