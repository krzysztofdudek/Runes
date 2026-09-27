# Runes

Shared code for the Yggdrasil tool family.

**Runes is not a family member for users.** Nobody installs Runes to get work done, and it adds no edge between the family's tools. It is shared code, vendored or installed: Grain, Jarl and Horde commit a pinned copy of the parts they use, and Yggdrasil installs `@chrisdudek/runes` from npm at an exact version. For the maintainer it is one more repository with its own CI, its own semver and its own releases.

Status: 0.1.0 is the skeleton. The subpaths exist and publish, the guard and the vendoring tool work, and the grammar manifest format is fixed. The relation extractor, the AST walker, the grammar build and the shared file-system, CLI and MCP code move in with the next releases.

## What goes in: the entry rule

Code enters Runes only when both hold:

1. **At least two consumers** need it, or a duplicate of it already exists in two tools.
2. **No exported identifier comes from a family tool's domain.** Runes speaks of files, syntax trees, commands and locks, never of graph nodes, aspects, conventions, loops, missions or tickets. The guard in `testkit` enforces this on every build.

| Subpath | Holds | Consumers |
|---|---|---|
| `@chrisdudek/runes/relations` | per-language relation extractors, the symbol table, the three-state resolver, path resolution, repository layout | Yggdrasil (npm), Grain (vendor) |
| `@chrisdudek/runes/ast` | `walk`; a parser with an injected parser factory and runtime identity | Yggdrasil, Grain |
| `@chrisdudek/runes/grammars` | the grammar manifest: grammar pins, the `web-tree-sitter` runtime pin, patches, and a build recipe verified by sha256 | Yggdrasil, Grain |
| `@chrisdudek/runes/fs` | `withLock`, `withLockAsync`, `writeAtomic`, the repository root through the git common dir | Jarl, Horde, Grain |
| `@chrisdudek/runes/cli` | a command-table schema, `parseArgs`, the `<tool>-error/1` error document, the single `--json` block rule | Jarl, Grain, Horde |
| `@chrisdudek/runes/mcp` | a stdio MCP server generated from a command table, run in process or through the CLI | Jarl, Grain, Horde |
| `@chrisdudek/runes/testkit` | the family guard, the git test environment, CLI/usage/MCP parity, `tools/list` measurement, a stdio MCP test client, and the runtime pin check | all |
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

## `fs`: locks, atomic writes, the root

```js
import { withLock, withLockAsync, writeAtomic, renameWithRetry, findRoot, mainCheckout } from '@chrisdudek/runes/fs';

withLock(join(stateDir, '.lock'), () => writeAtomic(file, text));   // sync, re-entrant per path
await withLockAsync(lockPath, async () => { /* ... */ });          // async, not re-entrant
const root = findRoot(process.cwd(), { marker: '<state dir>' });    // a worktree without the marker resolves to its main checkout
```

- `withLock(lockPath, fn, options?)` takes the lock file with an exclusive create and writes `<pid> <host> <ISO time>` into it. A stale lock is broken and taken over: empty and older than 2 s, a holder on this host whose pid is gone (or older than 10 minutes, against pid reuse), or one from another host older than 30 s. Breaking is serialised behind `<lock>.break`, and only a lock whose content is still the one judged stale is removed. A live holder that does not let go within `waitMs` (20 s) throws `LockHeldError` (`code: 'ELOCKED'`) naming the holder; a missing directory throws `LockDirectoryMissingError`. Nothing runs without the lock. Every limit is an option.
- `writeAtomic(path, data)` writes `.<name>.<pid>.<random>.tmp` beside the target and renames it over the target, so a reader never sees half a file; one ignore pattern, `.*.tmp`, covers the temporary files. `renameWithRetry` retries EPERM, EACCES and EBUSY on Windows (a file another process holds open) and EBUSY elsewhere, within a 2 s budget.
- `findRoot(from, { marker })` is the nearest checkout (a directory holding `.git`, a directory or a worktree's file). When that checkout lacks `marker` and the main checkout, found through `git rev-parse --git-common-dir`, has it, the main checkout is the root. `checkoutRoot`, `mainCheckout`, `gitCommonDir` and `isLinkedWorktree` are the pieces.

## `cli`: the command table, parsing, errors, one JSON block

```js
import { defineTable, parseArgs, renderResult, renderFailure, emit, readUsage } from '@chrisdudek/runes/cli';

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

try {
  const { command, args, flags } = parseArgs(TABLE, process.argv.slice(2));
  process.exitCode = emit(renderResult(run(command, args, flags), { json: flags.json === true }));
} catch (e) {
  process.exitCode = emit(renderFailure('demo', e, { json: process.argv.includes('--json') }));
}
```

- **The table** is the one source of the CLI, the MCP tools and the parity tests. An argument is `name`, `name?`, `name...` (one or more) or `name...?` (any number); a flag is `bool`, `value`, `many`, `number` or `path`. A command key may hold a subcommand (`decide rm`); an alias may name a command or a whole group. `writes`, `destructive` and `idempotent` become the MCP annotations; `paths` names the fields resolved against the working directory; `stdoutJson` marks a command that prints JSON unasked; `internal` keeps a hook command off the tools and the usage text. `defineTable` throws on a malformed table (order of arguments, duplicate names, a flag whose kind differs from the global one, an alias to nothing).
- **`parseArgs(table, argv)`** returns `{ command, words, args, flags }`. A value flag always takes the next word, even one that starts with `--`; a bare `--` ends the flags; only global flags may come before the command; an unknown flag names the ones the command takes; a single-value flag given twice, a missing required argument and surplus words are errors. Every refusal is a `UsageError` (code `usage`).
- **The error document** `<tool>-error/1` is `{ schema, code, what, why, next: { command, text } | null }`: `code` a stable word, `next.command` the step as argv when it is a command of the tool a reader can run as given. `CliError(code, what, { why, next, exitCode })` carries the parts; anything else thrown reads as `command-error`.
- **One JSON block**: with `--json`, stdout holds exactly one document, the answer or the error document, and every note goes to stderr. `renderResult`, `renderFailure` and `emit` do this; `isSingleJsonBlock` checks it.
- **`readUsage(usage, table)`** reads a hand-written usage text (the section after `commands:` or `usage:`) into blocks per command, with each entry's synopsis, description and `--flags`, and lists entries that name no command.

## `mcp`: a stdio server from the table

```js
import { createServer, serveStdio, inProcess, spawnCli, InvalidParams } from '@chrisdudek/runes/mcp';

const server = createServer({
  table: TABLE, version: '1.0.0',
  executor: inProcess(({ parsed, data }) => dispatch(data.root, parsed.command, parsed.args, parsed.flags)),   // Jarl style
  // executor: spawnCli({ args: [cliScript] }),                                                                // Grain style
  tools: { help: USAGE },
  timeoutMs: (command) => (command === 'propose' ? 3_600_000 : 600_000),
  prepare: ({ command, input }) => ({ data: { root: input.root ?? found }, notes: input.root ? {} : { root: `reached ${found}` } }),
});
serveStdio(server);
```

- **Tools**: one per public command, `<tool>_<command>` (`grain_decide_steer`), one field per argument and flag, `readOnlyHint`, `destructiveHint` and `idempotentHint` from the table, and a `<tool>_help` tool with the usage text when `help` is given. `describe` and `fieldNote` shape the text; short descriptions keep `tools/list` small, and the help tool carries the rest.
- **Input**: a call becomes the argv the CLI would get (flags inline, then `--`, then the arguments), so the CLI's parser reads it. Unknown fields, wrong types, a missing required argument, an argument after a gap, and a relative path in a field the table marks as a path are a JSON-RPC -32602 error, and nothing runs. `prepare` may refuse with `InvalidParams` too.
- **Executors**: `inProcess(run)` hands `run` the parsed call and takes back `{ value, text, notes, exitCode }` or a thrown refusal; it cannot be stopped midway, so a timeout or cancel drops its answer and the next call waits for it to end. `spawnCli({ command, args })` runs the CLI as a child in its own process group; a timeout, a cancel, stdin closing or SIGTERM/SIGINT/SIGHUP kill the whole tree (`taskkill /T /F` on Windows, where there are no process groups).
- **Answers**: a JSON answer is exactly one text block, notes in `_meta` under `<tool>/<key>`; a refusal in JSON mode is the `<tool>-error/1` document as that block. A non-zero exit or a refusal is `isError: true`.
- **Transport**: tool calls run one at a time, in order; `initialize`, `ping` and `tools/list` never wait behind them. `notifications/cancelled` stops a running call or drops a queued one, without an answer; a cancel for any other id is ignored. Client responses are ignored. The protocol version a client asks for comes back when it is one of `2025-06-18`, `2025-03-26`, `2024-11-05`; any other gets the first.

## `testkit`: tests every consumer runs

```js
import { gitEnv, makeTempRepo, assertParity, measureTools, formatToolsMeasure, listToolsOverStdio, startMcpClient, runtimePinProblems } from '@chrisdudek/runes/testkit';

const repo = makeTempRepo({ files: { 'src/a.ts': 'export {}\n' } });   // gitEnv: no user config, fixed identity and dates
const tools = await listToolsOverStdio({ command: process.execPath, args: [serverScript] });
assertParity({ table: TABLE, usage: USAGE, tools, toolOptions: { help: USAGE } });
console.log(formatToolsMeasure(measureTools(tools, { label: 'demo' })));      // a warning over 8 500 tokens, never a failure
```

- **`gitEnv(base, { name, email, date })`** carries the test config as `GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n` after any entries already there: `maintenance.auto=false` and `gc.auto=0` (no background git holding files a test deletes, fatal on Windows), `init.defaultBranch=main`, no signing, no hooks, `core.autocrlf=false`; with `GIT_CONFIG_GLOBAL` at the null device and `GIT_CONFIG_NOSYSTEM=1`, and a fixed identity and date, so commit ids repeat. `makeTempRepo` is a repository under the OS temp dir with it.
- **`parityProblems` / `assertParity`** hold the table, the usage text and the tools together both ways: a command without a tool or a usage entry, a tool or an entry that names no command, a field the tool lacks or has beyond the command's arguments and flags, a flag the usage does not mention or mentions without the command taking it.
- **`measureTools(tools, { budgetTokens })`** measures what `tools/list` sends, estimating tokens at four characters each, and returns a warning when the server is over budget (default 8 500 tokens). CI prints it; it never fails the build.
- **`startMcpClient` / `listToolsOverStdio`** drive a server over its real stdio in tests.
- **`runtimePinProblems`** compares a consumer's declared and installed `web-tree-sitter` with the grammar manifest's exact pin.

`testkit` imports `cli` and `mcp`; a vendoring consumer that takes `dist/testkit` takes those two as well (the vendor gate refuses a relative import of a file that is not vendored).

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
  "paths": ["dist/version.mjs", "dist/fs", "dist/cli"],
  "fragments": [{ "name": "worktree", "target": "../skills/tool/SKILL.md" }],
  "tool": { "path": "../scripts/runes.mjs" }
}
```

After `update` the pin also holds `tag`, `commit`, the sha256 of every vendored file in `files`, and the sha256 of each fragment and of the tool.

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
npm run check      # build, tests (with the guard and the vendor tool's end-to-end tests), dist freshness
```

`dist/` is committed because vendoring copies it from a clone; `npm run check:dist` rebuilds and fails when the result differs from what git holds. Node 22 or later.

## Releasing

Releases are the owner's step. Bump `version` in `package.json` and `RUNES_VERSION` in `src/version.mts`, add a `## [X.Y.Z] - <date>` section to `CHANGELOG.md`, commit, and push the tag `vX.Y.Z`. `.github/workflows/release.yml` then runs CI, refuses a tag that disagrees with `package.json` or a version without its CHANGELOG section, skips a version already on npm, and publishes with `npm publish --provenance --access public`, followed by a GitHub release carrying the CHANGELOG section.

Publishing uses npm trusted publishing (OIDC); there is no npm token secret, and the workflow installs a pinned npm (11.6.2) that supports it. A prerelease `X.Y.Z-<id>.N` publishes under the dist-tag `<id>` when `<id>` starts with a letter, otherwise under `next`.

**The first release is set up by hand, once, in this order:**

1. Push `main` with the release commit (version, `RUNES_VERSION` and the dated CHANGELOG section already in it), and let CI go green.
2. Publish 0.1.0 manually from a clean checkout of that commit: `npm ci && npm run check && npm publish --access public`. A trusted publisher can only be configured for a package that already exists on npm.
3. On npmjs.com, configure a trusted publisher for `@chrisdudek/runes`: GitHub Actions, repository `krzysztofdudek/Runes`, workflow file `release.yml`.
4. Push the tag `v0.1.0`. The workflow runs CI, finds 0.1.0 already on npm, and skips both the publish and the GitHub release.
5. Create the GitHub release for `v0.1.0` by hand (for example `gh release create v0.1.0 --title v0.1.0 --notes-file <the 0.1.0 CHANGELOG section>`), because step 4 skipped it.

From 0.1.1 on, pushing a tag is the whole release.

## License

MIT, see [LICENSE](LICENSE).
