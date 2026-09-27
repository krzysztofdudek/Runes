# Runes

Shared code for the Yggdrasil tool family.

**Runes is not a family member for users.** Nobody installs Runes to get work done, and it adds no edge between the family's tools. It is shared code, vendored or installed: Grain, Jarl and Horde commit a pinned copy of the parts they use, and Yggdrasil installs `@chrisdudek/runes` from npm at an exact version. For the maintainer it is one more repository with its own CI, its own semver and its own releases.

Status: the subpaths exist and publish, the guard and the vendoring tool work, and the relation extractors, the parser host and the grammar recipe have moved in from Yggdrasil, with the 460-case relation catalogue and their unit tests. The shared file-system, CLI and MCP code move in with the next releases.

## What goes in: the entry rule

Code enters Runes only when both hold:

1. **At least two consumers** need it, or a duplicate of it already exists in two tools.
2. **No exported identifier comes from a family tool's domain.** Runes speaks of files, syntax trees, commands and locks, never of graph nodes, aspects, conventions, loops, missions or tickets. The guard in `testkit` enforces this on every build.

| Subpath | Holds | Consumers |
|---|---|---|
| `@chrisdudek/runes/relations` | per-language relation extractors (11 languages), the symbol table, the three-state resolver, path resolution, repository layout; files are grouped by an injected owner lookup | Yggdrasil (npm), Grain (vendor) |
| `@chrisdudek/runes/ast` | `walk`, `closest`, the parse cache; a parser host over an injected tree-sitter runtime and runtime identity | Yggdrasil, Grain |
| `@chrisdudek/runes/grammars` | the grammar manifest (23 grammar pins, the `web-tree-sitter` runtime pin, the `tree-sitter-cli` pin), the patches, the build recipe verified by sha256, and the language table | Yggdrasil, Grain |
| `@chrisdudek/runes/fs` | `withLock`, `writeAtomic`, the repository root through the git common dir | Jarl, Horde, Grain |
| `@chrisdudek/runes/cli` | a command-table schema, `parseArgs`, the `<tool>-error/1` error document, the single `--json` block rule | Jarl, Grain, Horde |
| `@chrisdudek/runes/mcp` | a stdio MCP server generated from a command table, run in process or through the CLI | Jarl, Grain, Horde |
| `@chrisdudek/runes/testkit` | the family guard and the runtime pin check; later the git test environment, CLI/MCP parity and `tools/list` measurement | all |
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

**Grammars: the recipe and the pins, not the bytes.** `grammars/manifest.json` pins the union of the family's grammars (the 16 Yggdrasil reads, and 7 more Grain parses), the `web-tree-sitter` runtime (0.27.0) and the `tree-sitter-cli` (0.27.0) that builds grammars from source. Each pin carries the sha256 of the WASM and of its node-types.json. `buildGrammars({ outDir, only, resolveFrom })` materializes the pins: an npm pin is read from the installed package (at its pinned version), a `github-release` pin is downloaded, a `source` pin is checked out at its commit, patched (`grammars/patches/`), generated if asked, and built with `tree-sitter build --wasm` (emscripten or Docker). Nothing is written until every requested grammar matched its sha256. Downloads and builds land in a content-addressed cache (`RUNES_GRAMMAR_CACHE`, default `~/.cache/runes/grammars`). `verifyGrammarFiles(dir)` checks shipped or loaded grammars against the pins.

PHP is the `php` grammar, not `php_only`: PHP runs only what sits between its tags, and `php` reads a file that way, while `php_only` reads the whole file as code (a template's HTML becomes syntax errors, and prose outside any tag can become a false dependency). The whole PHP catalogue passes on both grammars.

**The runtime pin check.** `checkRuntimePins({ resolveFrom, languages })` from the test kit reports every package whose installed version differs from the manifest: the runtime, and the npm grammar packages of the given languages (`versions` passes a vendored runtime's recorded version, `cli: true` adds tree-sitter-cli). A consumer runs it in its tests, so the catalogue passing here means the same trees there.

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
npm run check      # build, grammars, tests (with the guard, the catalogue and the vendor tool's end-to-end tests), dist freshness
```

`npm test` builds the grammars of the language table into `.grammars/` (gitignored) with the recipe before it runs the tests; a warm cache needs no network, a cold one downloads and builds from source (Docker or emscripten for `tree-sitter build --wasm`). `npm run grammars` does that step alone. `dist/` is committed because vendoring copies it from a clone; `npm run check:dist` rebuilds and fails when the result differs from what git holds. Node 22 or later.

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
