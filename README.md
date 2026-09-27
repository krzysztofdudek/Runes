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
| `@chrisdudek/runes/fs` | `withLock`, `writeAtomic`, the repository root through the git common dir | Jarl, Horde, Grain |
| `@chrisdudek/runes/cli` | a command-table schema, `parseArgs`, the `<tool>-error/1` error document, the single `--json` block rule | Jarl, Grain, Horde |
| `@chrisdudek/runes/mcp` | a stdio MCP server generated from a command table, run in process or through the CLI | Jarl, Grain, Horde |
| `@chrisdudek/runes/testkit` | the family guard; later the git test environment, CLI/MCP parity, `tools/list` measurement and the runtime pin check | all |
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

Options: `--pin <file>` (default `$RUNES_PIN`, else `./runes.pin.json`), `--work-dir <dir>` (default `<git toplevel>/.runes`). Exit codes: 0 pass, 1 gate failure, 2 usage or environment error, 3 local report.

**Skill fragments.** A fragment lives in `skills/<name>.md` here. In a consumer's `SKILL.md` it sits between two marker lines, which the consumer places once:

```
<!-- RUNES:<name>:START -->
<!-- RUNES:<name>:END -->
```

`update` writes the fragment between them; `check` fails when the block differs from the pinned fragment.

**Bootstrapping a consumer.** Copy `tools/vendor.mjs` from the tag you want into the consumer (for example to `scripts/runes.mjs`), write the pin as above, add `.runes/` to `.gitignore`, run `update --tag vX.Y.Z`, commit the copy and the pin together, and call `check` from the test suite.

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

Publishing uses npm trusted publishing (OIDC); there is no npm token secret. The first publish of the package is a one-time manual step by the owner (`npm publish --access public` from a clean checkout of the tag), because a trusted publisher can only be configured for a package that exists. After that, configure a trusted publisher on npmjs.com for `@chrisdudek/runes`: this repository (`krzysztofdudek/Runes`) and the workflow file `release.yml`. From then on every tag publishes itself.

## License

MIT, see [LICENSE](LICENSE).
