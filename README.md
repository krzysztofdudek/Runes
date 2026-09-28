# Runes

Shared code for the Yggdrasil tool family.

**Runes is not a family member for users.** Nobody installs Runes to get work done, and it adds no edge between the family's tools. It is shared code, vendored or installed: Grain, Jarl and Horde commit a pinned copy of the parts they use, and Yggdrasil installs `@chrisdudek/runes` from npm at an exact version. For the maintainer it is one more repository with its own CI, its own semver and its own releases.

Status: 1.0.0, the first release for npm (the 0.1.x tags were for vendoring only). Every subpath carries code: the relation extractors, the parser host and the grammar recipe moved in from Yggdrasil with the 460-case relation catalogue and their unit tests, and the command table, the MCP adapter, the test kit and the skill fragments. What 1.x keeps stable is in [docs/api.md](docs/api.md): only what a family tool imports today, so the file-system code and most of the CLI code ship as internal modules (below).

**The stable API.** [docs/api.md](docs/api.md) lists every name the six subpaths export, which family tool imports it, and what semver 1.x promises and does not; a test holds that page and the exports together.

## What goes in: the entry rule

Code enters Runes only when both hold:

1. **At least two consumers** need it, or a duplicate of it already exists in two tools.
2. **No exported identifier comes from a family tool's domain.** Runes speaks of files, syntax trees, commands and locks, never of graph nodes, aspects, conventions, loops, missions or tickets. The guard in `testkit` enforces this on every build.

| Subpath | Holds | Consumers |
|---|---|---|
| `@chrisdudek/runes/relations` | per-language relation extractors (11 languages), the symbol table, the three-state resolver, path resolution, repository layout; files are grouped by an injected owner lookup | Yggdrasil (npm), Grain (vendor) |
| `@chrisdudek/runes/ast` | `walk`, `closest`, the parse cache; a parser host over an injected tree-sitter runtime and runtime identity | Yggdrasil, Grain |
| `@chrisdudek/runes/grammars` | the grammar manifest (23 grammar pins, the `web-tree-sitter` runtime pin, the `tree-sitter-cli` pin), the patches, the build recipe verified by sha256, and the language table | Yggdrasil, Grain |
| `@chrisdudek/runes/cli` | the command table (`defineTable`), the one source of a tool's CLI, MCP tools and parity tests | Jarl, Grain, Horde |
| `@chrisdudek/runes/mcp` | a stdio MCP server generated from a command table, run in process or through the CLI | Jarl, Grain, Horde |
| `@chrisdudek/runes/testkit` | the family guard, the runtime pin check, the git test environment, CLI/usage/MCP parity, `tools/list` measurement and a stdio MCP test client | all |
| `skills/` | shared skill fragments, kept in consumers' `SKILL.md` between markers | Jarl, Grain, Horde |
| `tools/vendor.mjs` | the vendoring tool and its gate | every vendoring consumer |

## Never in Runes

- Jarl's record: those are Jarl's nouns.
- Anything that knows a graph, an aspect, a convention, a loop, a mission or a ticket.
- `owner-index`, `type-gate`, `verifier`, `pass`, `facts-cache`.
- Grain's convention extraction.
- Transactional merge, while it has a single consumer.
- The family canon check: it stays in the hub and runs at release.
- Executables: the package has no `bin`.
- Network access at run time.
- Runtime dependencies: `web-tree-sitter` is an optional peer dependency, for types only.

## Internal: locks, atomic writes, the root (`dist/fs/`)

No subpath exports this code in 1.x yet: no family tool uses it, and 1.0.0 promises only what a tool imports. It ships under `dist/fs/` and is tested like the rest (including the lock's property tests); a 1.x minor exports it, additively, when a tool adopts it, and until then it may change in any release. What it does:

```js
withLock(join(stateDir, '.lock'), () => writeAtomic(file, text));   // sync, re-entrant per path
await withLockAsync(lockPath, async () => { /* ... */ });          // async, not re-entrant
const root = findRoot(process.cwd(), { marker: '<state dir>' });    // a worktree without the marker resolves to its main checkout
```

- `withLock(lockPath, fn, options?)` takes the lock file with an exclusive create and writes `<pid> <host> <ISO time>` into it. A stale lock is broken and taken over: empty and older than 2 s, a holder on this host whose pid is gone (or older than 10 minutes, against pid reuse), or one from another host older than 30 s. Breaking is serialised behind `<lock>.break`, and only a lock whose content is still the one judged stale is removed. A live holder that does not let go within `waitMs` (20 s) throws `LockHeldError` (`code: 'ELOCKED'`) naming the holder; so does a stale lock that could not be taken over by the deadline (`stale: true`). A stale lock that cannot be removed at all (no permission on the lock, on `<lock>.break` or on the directory) throws `LockBreakError` (`code: 'ELOCKBREAK'`) at once, since waiting would not help. A missing directory throws `LockDirectoryMissingError`. Nothing runs without the lock. Every limit is an option. `withLock` is re-entrant for one path; `withLockAsync` is not: a nested `withLockAsync`, or a synchronous `withLock`, on the same path inside it waits for itself until `waitMs` and then throws `ELOCKED`.
- `writeAtomic(path, data)` writes `.<name>.<pid>.<random>.tmp` beside the target and renames it over the target, so a reader never sees half a file; one ignore pattern, `.*.tmp`, covers the temporary files. `renameWithRetry` retries EPERM, EACCES and EBUSY on Windows (a file another process holds open) and EBUSY elsewhere, within a 2 s budget.
- `findRoot(from, { marker })` is the nearest checkout (a directory holding `.git`, a directory or a worktree's file). When that checkout lacks `marker` and the main checkout, found through `git rev-parse --git-common-dir`, has it, the main checkout is the root. `checkoutRoot`, `mainCheckout`, `gitCommonDir` and `isLinkedWorktree` are the pieces.

## `cli`: the command table

`@chrisdudek/runes/cli` exports `defineTable` and the shape it takes (`CommandTable`, `CommandSpec`, `FlagKind`). The parser, the error document and the one-block rule described after the table are internal modules in 1.x: the MCP adapter and the test kit run on them, so a tool's MCP tools read a call exactly as described here, but a tool does not import them yet (the example's second half shows the shape a later 1.x minor may export).

```js
import { defineTable } from '@chrisdudek/runes/cli';

export const TABLE = defineTable({
  tool: 'demo',
  globalFlags: { json: 'bool', root: 'path' },
  commands: {
    new: { args: ['title'], flags: { tag: 'many', prio: 'number' }, writes: true, summary: 'File an issue.' },
    'decide rm': { args: ['id'], writes: true, destructive: true },
    sources: { args: ['files...?'], paths: ['files'] },
  },
  aliases: { seed: 'decide' },
});

// internal in 1.x, not importable from the package:
try {
  const { command, args, flags } = parseArgs(TABLE, process.argv.slice(2));
  process.exitCode = emit(renderResult(run(command, args, flags), { json: flags.json === true }));
} catch (e) {
  process.exitCode = emit(renderFailure('demo', e, { json: process.argv.includes('--json') }));
}
```

- **The table** is the one source of the CLI, the MCP tools and the parity tests. An argument is `name`, `name?`, `name...` (one or more) or `name...?` (any number); a flag is `bool`, `value`, `many`, `number` or `path`. A command key may hold a subcommand (`decide rm`); an alias may name a command or a whole group. `writes`, `destructive` and `idempotent` become the MCP annotations; `paths` names the fields resolved against the working directory; `stdoutJson` marks a command that prints JSON unasked; `internal` keeps a hook command off the tools and the usage text. `defineTable` throws on a malformed table (order of arguments, duplicate names, a flag whose kind differs from the global one, an alias to nothing, `destructive` or `idempotent` on a command that does not write).
- **`parseArgs(table, argv)`** (internal) returns `{ command, words, args, flags }`. A value flag always takes the next word, even one that starts with `--`; a bare `--` ends the flags; only global flags may come before the command; an unknown flag names the ones the command takes; a single-value flag given twice, a missing required argument and surplus words are errors. Every refusal is a `UsageError` (code `usage`).
- **The error document** (internal code; the document itself is a stable format) `<tool>-error/1` is `{ schema, code, what, why, next: { command, text } | null }`: `code` a stable word, `next.command` the step as argv when it is a command of the tool a reader can run as given. `CliError(code, what, { why, next, exitCode })` carries the parts; anything else thrown reads as `command-error`.
- **One JSON block** (internal code; the rule holds for the MCP answers): with `--json`, stdout holds exactly one document, the answer or the error document, and every note goes to stderr. `renderResult`, `renderFailure` and `emit` do this; `isSingleJsonBlock` checks it.

## `mcp`: a stdio server from the table

```js
import { createServer, serveStdio, spawnCli, InvalidParams } from '@chrisdudek/runes/mcp';

const server = createServer({
  table: TABLE, version: '1.0.0',
  executor: spawnCli({ args: [cliScript] }),                                                                   // Grain and Horde style
  tools: { help: USAGE },
  timeoutMs: (command) => (command === 'propose' ? 3_600_000 : 600_000),
  concurrency: { total: 4, perCommand: (command) => (command === 'propose' ? 1 : Infinity) },                // spawn only
  prepare: ({ command, input }) => ({ data: { root: input.root ?? found }, notes: input.root ? {} : { root: `reached ${found}` } }),
});
serveStdio(server);
```

- **Tools**: one per public command, `<tool>_<command>` (`grain_decide_steer`), one field per argument and flag, and a `<tool>_help` tool with the usage text when `help` is given. A field says only what its name and type cannot: a path field is described as `An absolute path.`, every other field has no description of its own unless `fieldNote` gives one, because the flag's name is the field's name, its kind is the type, and the usage lives in the help tool once instead of in every tool. The annotations say only what differs from the MCP defaults: `readOnlyHint: true` on a command that does not write; on one that writes, `destructiveHint: false` unless the table marks it destructive and `idempotentHint: true` when the table marks it idempotent; `openWorldHint: false` on every tool. The schema has no `additionalProperties: false`: the server refuses an unknown field itself on every tool, the help tool included (-32602, naming the fields the tool takes), before `prepare` or the executor runs. `describe` shapes the tool's description. On the family's tables this keeps `tools/list` inside the 8 500-token budget: Horde's 81 tools measure about 8 000 tokens, Jarl's 38 about 7 000 and Grain's 27 about 5 300 (from 14 100, 9 600 and 7 600 before 1.0.0), with every field kept.
- **Input**: a call becomes the argv the CLI would get (flags inline, then `--`, then the arguments), so the CLI's parser reads it. Unknown fields, wrong types, a missing required argument, an argument after a gap, and a relative path in a field the table marks as a path are a JSON-RPC -32602 error, and nothing runs. `transformInput({ command, input })` rewrites the fields before that check (a repository-relative path made absolute, a container path translated, a "bare name or absolute path" field refused with `InvalidParams`), and `transformArgv({ command, argv, input })` rewrites the argv after it, so a consumer keeps its own path rules without forking the adapter. `prepare` may refuse with `InvalidParams` too.
- **Executors**: `spawnCli({ command, args })` runs the CLI as a child in its own process group; a timeout, a cancel, stdin closing or SIGTERM/SIGINT/SIGHUP kill the whole tree (`taskkill /T /F` on Windows, where there are no process groups). The in-process executor is internal in 1.x (no family tool runs one: Jarl dispatches in process through its own message handler and `serveStdio`); a 1.x minor exports it, with the result and error types its `run` answers in, when a tool adopts it. Inside Runes it works like this: `inProcess(run)` hands `run` the parsed call and takes back `{ value, text, notes, exitCode }` or a thrown refusal. A synchronous `run` blocks the event loop while it runs: `ping`, `tools/list`, a cancel and the timeout all wait until it returns, so a timeout can only answer after the work has finished. Only an async `run` that awaits and honours `ctx.signal` gets the transport's promises (answers while it runs, a timeout or cancel that stops it). No in-process run can be killed: a timeout or cancel drops its answer, and the next call waits for it to end.
- **Answers**: a JSON answer is exactly one text block, notes in `_meta` under `<tool>/<key>`, never in a second block; a refusal in JSON mode is the `<tool>-error/1` document as that block, or with `errorDocuments: false` the message text as that block, notes still in `_meta`. A non-zero exit or a refusal is `isError: true`.
- **Transport**: by default tool calls run one at a time, in order. `concurrency: { total, perCommand }` lets a server with the spawn executor run several at once: `total` bounds all calls together, `perCommand` (a number, or a function of the command) the calls of one command, and a call over either limit waits, oldest first among the calls it competes with, while a call held back by its own command's limit does not hold back a later call of another command. Answers then go out as calls finish. Each call's time limit counts from when it starts running, never while it waits, and a cancel stops only its own call. `createServer` refuses `total` above 1 with an in-process executor, since an in-process run cannot be stopped. `initialize`, `ping` and `tools/list` are never queued behind calls (a synchronous in-process run still blocks everything while it runs). `notifications/cancelled` stops a running call or drops a waiting one, without an answer. A cancel for any other id is ignored: a late cancel, arriving after its call was answered, does nothing, and a later request that reuses the id is answered as usual. Client responses are ignored. The protocol version a client asks for comes back when it is one of `2025-06-18`, `2025-03-26`, `2024-11-05`; any other gets the first.

## `testkit`: tests every consumer runs

```js
import { assertParity, measureTools, formatToolsMeasure, listToolsOverStdio, startMcpClient } from '@chrisdudek/runes/testkit';

const tools = await listToolsOverStdio({ command: process.execPath, args: [serverScript] });
assertParity({ table: TABLE, usage: USAGE, tools, toolOptions: { help: USAGE } });
console.log(formatToolsMeasure(measureTools(tools, { label: 'demo' })));      // a warning over 8 500 tokens, never a failure
```

- **The git test environment** (internal in 1.x: no family tool imports it, Runes' own tests use it; a 1.x minor exports it when a tool adopts it). `gitEnv(base, { name, email, date, config })` first drops every variable `git rev-parse --local-env-vars` names (`GIT_DIR`, `GIT_INDEX_FILE`, `GIT_WORK_TREE`, `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY`, `GIT_CONFIG_PARAMETERS`, ...) and any inherited `GIT_CONFIG_*` entry, so a suite run from a git hook never reaches the outer repository. It then sets the test config as `GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n`: `maintenance.auto=false` and `gc.auto=0` (no background git holding files a test deletes, fatal on Windows), `init.defaultBranch=main`, no signing, `core.autocrlf=false`, and `core.hooksPath` at an empty directory; `GIT_CONFIG_GLOBAL` points at an empty file (both in a private temp directory, which works on every platform where `/dev/null` does not), `GIT_CONFIG_NOSYSTEM=1`, and a fixed identity and date, so commit ids repeat. `makeTempRepo({ files, env })` is a repository under the OS temp dir with it.
- **`parityProblems` / `assertParity`** hold the table, the usage text and the tools together both ways: a command without a tool or a usage entry, a tool or an entry that names no command, a field the tool lacks or has beyond the command's arguments and flags, a field whose type or item type differs from what the table makes it, a different set of required fields, arguments listed out of the table's order, and a flag the usage does not mention or mentions without the command taking it. The usage text is read as the section after `commands:` or `usage:`, one block per command with each entry's synopsis, description and `--flags`, and an entry that names no command is reported.
- **`measureTools(tools, { budgetTokens })`** measures what `tools/list` sends, estimating tokens at four characters each, and returns a warning when the server is over budget (default 8 500 tokens). CI prints it; it never fails the build.
- **`startMcpClient` / `listToolsOverStdio`** drive a server over its real stdio in tests. `stop(graceMs)` closes stdin, waits for the server to leave (2 s by default), then kills it with everything it started.
- **`checkRuntimePins`** checks a consumer's runtime and grammar packages against the manifest (see [Relations, syntax trees and grammars](#relations-syntax-trees-and-grammars) below).

`testkit` imports `cli` and `mcp`; a vendoring consumer that takes `dist/testkit` takes those two as well (the vendor gate refuses a relative import of a file that is not vendored).

## `skills/`: shared skill fragments

A fragment is a piece of skill text more than one tool's `SKILL.md` carries word for word. It lives here as `skills/<name>.md` and in the consumer between `<!-- RUNES:<name>:START -->` and `<!-- RUNES:<name>:END -->`, filled and checked by `tools/vendor.mjs` (see below). Fragments are tool-neutral: they speak of "the tool", `<tool>_<command>` and "the coordinator", never of a family tool by name, so one text fits every consumer; the consumer's own text around the markers names itself.

| Fragment | Says |
|---|---|
| `mcp-first` | call the tool's MCP tools first (fields, absolute paths for what the command would look up from the working directory, one JSON block, -32602 and `isError`, `<tool>-error/1` where the tool has one, the time limit where the server sets one); the CLI is the fallback |
| `worker-worktree` | a worker works in its own worktree on its own branch, one issue per commit, state passed by the main checkout's absolute path, scratch outside the repository, the brief's checks pass before the report, merging is never the worker's |
| `evidence` | the `--ran`/`--saw` vocabulary: the exact command and what it printed, pairs by position, notes never prove, a fix shows red then green, evidence is appended |

A fragment states only what is true of every consumer that carries it; what differs (a tool whose workers leave the full check to the merger, a tool whose path fields are relative to the repository) stays in the consumer's own text around the markers. A tool's own working protocol is not a fragment: Yggdrasil's is printed by `yg prime` from the installed CLI, and a copy here would drift from the version a repository actually runs.

## The guard

`@chrisdudek/runes/testkit` exports `runGuard`, which scans source files and fails when code shipped by one tool:

- **imports** another tool's package or module (`@chrisdudek/yg`, `../jarl/scripts/jarl.mjs`, ...);
- **runs** another tool's executable through `spawn`, `exec`, `execFile`, `fork` or `execa` (`yg`, `grain`, `jarl`, `horde`, or a script of that name);
- **builds a path** into another tool's state directory (`.yggdrasil/`, `.grain/`, `.jarl/`, `.horde/`) in a string literal;
- **exports an identifier** carrying a family domain word (node as a graph node, aspect, horde, jarl, ticket, mission, loop).

It reads code shape, never prose: comments and words in messages do not count, and `node` next to `syntax`, `ast`, `tree`, `sitter`, `parse`, `parser` or `walk` is taken as a syntax node. A tool passes `self` and its declared dependency `edges`, and may narrow or empty the domain word list. Exceptions live in a `guard.allow` file at the repository root, one `<path> <rule> [<subject>]  # reason` per line, reviewed like code; an entry that silences nothing fails the guard.

**What the guard does not see.** It is a lexical check on token patterns, not a type checker or a data-flow analysis, so it catches the honest ways of reaching another tool and misses these:

- a command or module name held in a variable, a constant from another file, or a computed string (`spawn(cmd)`, `import(spec)` with a non-literal `spec`);
- `process.execPath` with a bin path built at run time; a literal path that names the package or the script (`node_modules/@chrisdudek/yg/...`, `.../jarl.mjs`) is caught, a path assembled with `join()` from neutral pieces is not;
- modules loaded through `createRequire(...)` and then called, or any other indirection over `require`; `require('x')`, `require.resolve('x')` and `import.meta.resolve('x')` with literals are caught;
- a shell command whose tool name is glued to other text without a space or shell operator, and anything interpolated into a template (`` $`${tool} check` ``); static text of zx `$` and execa tagged templates is checked;
- a `Worker`, child process or `vm` script whose entry is not a literal;
- state paths assembled from pieces (`'.' + 'jarl'`).

Review covers what the guard cannot: the guard makes the ordinary mistake impossible to miss, not a deliberate bypass impossible to write.

```js
import { runGuard, guardPassed, formatGuardReport, guardConfig } from '@chrisdudek/runes/testkit';

const report = runGuard({ root: repoRoot, dirs: ['src'], config: guardConfig({ self: 'grain', edges: ['yggdrasil'], domainWords: [] }) });
assert.ok(guardPassed(report), formatGuardReport(report));
```

## Relations, syntax trees and grammars

**No module imports `web-tree-sitter` by value.** The consumer loads the runtime (from npm or from a vendored copy) and injects it, so grammars, parsers and trees all come from one copy of the runtime. The consumer also passes the runtime's identity, which is folded into every grammar digest: a runtime upgrade can change trees just as a grammar upgrade can.

```js
import * as TreeSitter from 'web-tree-sitter';
import { createRequire } from 'node:module';
import { createParserHost, fileSha256 } from '@chrisdudek/runes/ast';
import { extractorForLanguage } from '@chrisdudek/runes/relations';

const host = createParserHost({
  runtime: TreeSitter,
  runtimeIdentity: () => fileSha256(createRequire(import.meta.url).resolve('web-tree-sitter/web-tree-sitter.wasm')),
  grammarDirs: [grammarDir],          // where buildGrammars wrote the pinned grammars
});
await host.withParsedFile('src/a.kt', code, (tree) => {
  const file = { path: 'src/a.kt', content: code, tree, language: 'kotlin', newParser: host.newParser };
  return extractorForLanguage('kotlin').uses(file);
});
```

The host gives `getParser`, `parseFile`, `withParsedFile`, `loadGrammarsFor`, `loadedParserFor`, `newParser`, `grammarWasmHash`, `grammarDigest` and `grammarDigestForLanguage`; a custom `languages` table parses languages the Runes table does not have. `ParsedFile.newParser` is the one other injection: the Kotlin extractor re-parses spans of a file with syntax errors, and a damaged Kotlin file without it throws rather than silently reading less.

The resolver attributes a resolved file to an owner through an injected `ownerIndex: { ownerOf(file) }`: whatever unit the consumer groups files by. `makeResolvePathToFile(root, ownerOf, isExcluded)` resolves specifiers against the files on disk; a caller that resolves specifiers fresh from source passes an `isExcluded` built from the same exclusion set as `ownerOf`.

**Grammars: the recipe and the pins, not the bytes.** `grammars/manifest.json` pins the union of the family's grammars (the 16 Yggdrasil reads, and 7 more Grain parses), the `web-tree-sitter` runtime (0.27.0, with the sha256 of its WASM) and the `tree-sitter-cli` (0.27.0) that builds grammars from source. Each pin carries the sha256 of the WASM and of its node-types.json. `buildGrammars({ outDir, only, resolveFrom })` materializes the pins: an npm pin is read from the installed package (at its pinned version), a `github-release` pin is downloaded, a `source` pin is checked out at its commit, patched (`grammars/patches/`), generated if asked, and built with `tree-sitter build --wasm`, which fetches the wasi-sdk it compiles with into `~/.cache/tree-sitter` on first use (no Docker, no emscripten). Nothing is written until every requested grammar matched its sha256. Downloads and builds land in a content-addressed cache (`RUNES_GRAMMAR_CACHE`, default `~/.cache/runes/grammars`). `verifyGrammarFiles(dir)` checks shipped or loaded grammars against the pins.

**Grammars on Windows.** A source build is refused on Windows, before anything is downloaded, with the reason in the error. The build itself would run, but its bytes never match the pin: the wasi-sdk that `tree-sitter build --wasm` fetches on Windows (wasi-sdk-34 for tree-sitter-cli 0.27.0) names its clang `23.1.0-rc3` in the WASM `producers` section, where the Linux and macOS builds of the same LLVM commit say `23.1.0-wasi-sdk`. The compiled code is byte-identical, and the pins are the Linux and macOS bytes. So on Windows, build the grammars on Linux, macOS or WSL and copy the cache directory over (its files are named by their sha256), or set `RUNES_GRAMMAR_CACHE` to such a copy. `buildGrammars` re-hashes every cached file, so a copied cache is trusted no more than one built locally. npm and `github-release` pins work on Windows as they do elsewhere.

PHP is the `php` grammar, not `php_only`: PHP runs only what sits between its tags, and `php` reads a file that way, while `php_only` reads the whole file as code (a template's HTML becomes syntax errors, and prose outside any tag can become a false dependency). The whole PHP catalogue passes on both grammars.

**The runtime pin check.** `checkRuntimePins({ resolveFrom, languages })` from the test kit reports every package whose installed version differs from the manifest: the runtime, and the npm grammar packages of the given languages. It also hashes the runtime's `web-tree-sitter.wasm` against `runtime.wasmSha256`, so the right version with other engine bytes fails too (`versions` and `runtimeWasm` pass a vendored runtime's recorded version and its copy of the WASM, `cli: true` adds tree-sitter-cli). A consumer runs it in its tests, so the catalogue passing here means the same trees there.

**The catalogue.** `reference/relations/<language>/<id>.md` holds 460 relation cases in 12 languages, each with its files and its expected edges or silence. `test/relations/reference-case-runner.mjs` drives the real extractors, symbol table and resolver over each case, one test per case in the matrix suites.

## Vendoring with `tools/vendor.mjs`

A vendoring consumer keeps three things, all committed, plus one ignored directory:

```
vendor/runes/          the copy: chosen files of dist/ and skills/, under their Runes paths
vendor/runes.pin.json  the pin
scripts/runes.mjs      a copy of tools/vendor.mjs, itself under the pin
.runes/                in .gitignore; the tool's fresh clones, used only by check --ci and update
```

The pin names what to take; `update` fills in the rest. Consumer-side paths are relative to the pin file's directory:

```json
{
  "source": "https://github.com/krzysztofdudek/Runes.git",
  "dest": "runes",
  "paths": ["dist/version.mjs", "dist/cli", "dist/mcp"],
  "fragments": [{ "name": "worktree", "target": "../skills/tool/SKILL.md" }],
  "tool": { "path": "../scripts/runes.mjs" }
}
```

After `update` the pin also holds `tag`, `commit`, the sha256 of every vendored file in `files`, and the sha256 of each fragment and of the tool.

A consumer that takes only skill fragments leaves out `paths` and `dest`: it has no `vendor/runes/` copy, and the pin, the tool and the blocks in its `SKILL.md` are the whole vendoring. A pin must name at least one path or one fragment.

| Command | When | What it does |
|---|---|---|
| `node scripts/runes.mjs check` | always: `npm test`, pre-commit, offline | sha256 of every vendored file, skill fragment and the tool against the pin; a hand edit, a missing file, an extra file, or a relative import of a file that is not vendored exits 1 |
| `node scripts/runes.mjs check --ci` | CI (also when `CI=true`, unless `--offline`) | the offline check, then a fresh shallow clone of the tag into `.runes/`, `rev-parse HEAD` against the pinned commit, and a byte compare of every file, fragment and the tool with the clone; a moved tag or a pin that disagrees with its tag exits 1 |
| `node scripts/runes.mjs update [--tag vX.Y.Z]` | by hand | clones the tag (default: the highest `vX.Y.Z`), copies `paths`, fills fragments between their markers, updates the tool, rewrites the pin, and prints the changed files and the Runes CHANGELOG between the old and the new tag |
| `RUNES_DIR=../Runes node scripts/runes.mjs check --local` | co-development before a tag | a report of how the copy differs from a Runes working tree; always exits 3, because a working tree is never a pass |

Options: `--pin <file>` (default `$RUNES_PIN`, else `./runes.pin.json`), `--work-dir <dir>` (default `<repository root>/.runes`). `RUNES_GIT_TIMEOUT_MS` bounds every git call (default 120000). Exit codes: 0 pass, 1 gate failure, 2 usage or environment error, 3 local report. A pin without a `tool` entry works but warns on every run, because the script that runs the gate would then be unchecked.

**Skill fragments.** A fragment lives in `skills/<name>.md` here. In a consumer's `SKILL.md` it sits between two marker lines, which the consumer places once:

```
<!-- RUNES:<name>:START -->
<!-- RUNES:<name>:END -->
```

`update` writes the fragment between them, in the target file's own line endings, and several fragments may share one file; `check` fails when the block differs from the pinned fragment. The comparison ignores CRLF versus LF, and a fragment always ends with a newline, so the END marker stays on its own line.

**Line endings and links.** The vendored files are compared byte for byte, so a checkout that turns LF into CRLF (Git for Windows with `core.autocrlf=true`) breaks the gate; `check` says so and names the fix. Add the copy to the consumer's `.gitattributes`, for example `vendor/runes/** -text`. Runes itself keeps `dist/`, `skills/` and `tools/` LF through its own `.gitattributes`, and the tool clones with `core.autocrlf=false`. Symbolic links are refused on both sides: in the Runes tag under `paths`, and in the consumer's copy.

**Path rules.** `dest`, every fragment `target` and `tool.path` must be relative and resolve inside the consumer's repository (the nearest directory upward holding `.git`), never to its root and never into `.git`. Every entry of `paths` must be a relative path inside Runes, not `.` and not into `.git`.

**What the gate proves, and what it does not.** `check` and `check --ci` prove that the copy is byte for byte what the pinned tag of the pinned `source` holds; every run prints that `source`. That protects against accidents and hand edits: a quick fix in the copy, a partial update, a moved tag, a pin edited by hand. It does not protect against a malicious change that rewrites the pin and its `source` together, pointing the gate at a repository that agrees with the tampered copy. That is a review question: a pull request that changes `source` in a pin deserves the same scrutiny as one that adds a dependency.

**Bootstrapping a consumer.** Copy `tools/vendor.mjs` from the tag you want into the consumer (for example to `scripts/runes.mjs`), write the pin as above, add `.runes/` to `.gitignore` and the copy to `.gitattributes` as `-text`, run `update --tag vX.Y.Z`, commit the copy and the pin together, and call `check` from the test suite.

**Windows.** The tool needs only Node and `git` on `PATH`; it spawns no shell and no `.cmd` shim, and it takes pin paths with forward slashes only, so a pin written on one OS works on the others. Mark the consumer's copy of the tool `-text` as well (for example `scripts/runes.mjs -text`), because `check` compares it byte for byte; fragment targets need no entry, since the fragment comparison ignores CRLF.

## The change path

A change to shared code travels one way:

1. **Tag** a Runes release: CI green, then the release workflow publishes to npm.
2. **Bump the pin** in every consumer, one commit each (`update --tag` for vendoring consumers, the exact version in `package.json` for Yggdrasil).
3. **Gate**: the consumer's `check` (and `check --ci` in its CI) proves the copy is the tag, byte for byte.
4. **Consumer CI**: the consumer's full suite runs on the new code.

At a family release every pin points at the same Runes version.

## Building and testing

```
npm ci
npm run check      # build, grammars, tests (with the guard, the catalogue and the vendor tool's end-to-end tests), dist freshness
npm run coverage   # the same suite under Node's coverage, failing below 98% lines, 92% branches, 97% functions of dist/
```

The property tests (`test/properties.test.mjs`, and the gate property in `test/vendor.test.mjs`) draw a fresh seed each run and print it with any failure; `RUNES_PROPERTY_SEED=<n>` replays one. They hold the contracts on generated inputs: a tool call read back by `parseArgs` is the call itself for any table and any values, a command line parses the same whatever order its flags take, every malformed line is a `UsageError`, contending processes never hold the lock at once and `withLock` takes over exactly the locks the staleness rules call stale, and every edit to a vendored copy, the tool or a fragment block fails the gate while edits outside the blocks do not.

`npm test` builds the grammars of the language table into `.grammars/` (gitignored) with the recipe before it runs the tests; a warm cache needs no network, a cold one downloads and builds from source (`tree-sitter build --wasm` fetches its own wasi-sdk on first use). `npm run grammars` does that step alone. `dist/` is committed because vendoring copies it from a clone; `npm run check:dist` rebuilds and fails when the result differs from what git holds. Node 22 or later. CI runs the suite on Ubuntu and on Windows, Node 22 and 24 on both; the Windows jobs read the grammars offline from a cache the Ubuntu `grammars` job builds and hands over as an artifact (see [Grammars on Windows](#relations-syntax-trees-and-grammars)).

## Releasing

Releases are the owner's step. Bump `version` in `package.json` and `RUNES_VERSION` in `src/version.mts`, add a `## [X.Y.Z] - <date>` section to `CHANGELOG.md`, commit, and push the tag `vX.Y.Z`. `.github/workflows/release.yml` then runs CI, refuses a tag that disagrees with `package.json` or a version without its CHANGELOG section, skips a version already on npm, and publishes with `npm publish --provenance --access public`, followed by a GitHub release carrying the CHANGELOG section.

Publishing uses npm trusted publishing (OIDC); there is no npm token secret, and the workflow installs a pinned npm (11.6.2) that supports it. A prerelease `X.Y.Z-<id>.N` publishes under the dist-tag `<id>` when `<id>` starts with a letter, otherwise under `next`.

**The first release is set up by hand, once, in this order:**

1. Push `main` with the release commit (version, `RUNES_VERSION` and the dated CHANGELOG section already in it), and let CI go green.
2. Publish 1.0.0 manually from a clean checkout of that commit: `npm ci && npm run check && npm publish --access public`. A trusted publisher can only be configured for a package that already exists on npm.
3. On npmjs.com, configure a trusted publisher for `@chrisdudek/runes`: GitHub Actions, repository `krzysztofdudek/Runes`, workflow file `release.yml`.
4. Push the tag `v1.0.0`. The workflow runs CI, finds 1.0.0 already on npm, and skips both the publish and the GitHub release.
5. Create the GitHub release for `v1.0.0` by hand (for example `gh release create v1.0.0 --title v1.0.0 --notes-file <the 1.0.0 CHANGELOG section>`), because step 4 skipped it.

From 1.0.1 on, pushing a tag is the whole release. The tags v0.1.0 to v0.1.4 predate npm and stay usable for vendoring only.

## License

MIT, see [LICENSE](LICENSE).
