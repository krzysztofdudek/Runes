# Runes

Runes is shared code for the Yggdrasil tool family (Yggdrasil, Grain, Jarl, Horde). It is not a family member for users: nobody installs Runes to do anything. Tools vendor it (Grain, Jarl, Horde) or install it from npm (Yggdrasil). Read `README.md` for the entry rule and the "never in Runes" list before adding anything.

## Check command

`npm run check` runs everything CI runs: the TypeScript build, the test suite (which includes the guard over this repository's own `src/`, `tools/` and `scripts/`, and the vendor tool's end-to-end tests), and the dist freshness check. Run it before every commit. `npm test` alone builds and tests without the freshness check, for use while `dist/` changes are still uncommitted.

## Conventions

- Source is TypeScript in `src/`, as `.mts` files, built by `tsc` to `dist/` as `.mjs` with `.d.mts`, target Node 22. Relative imports in source name the output file (`./x.mjs`).
- `dist/` is committed. Every change to `src/` commits the rebuilt `dist/` in the same commit; CI fails otherwise.
- One version covers every subpath. `package.json` `version`, `src/version.mts` `RUNES_VERSION` and the top `CHANGELOG.md` section move together (a test and the release workflow check it).
- Zero runtime dependencies. `web-tree-sitter` is an optional peer dependency, for types only, and its version equals the runtime pin in `grammars/manifest.json` (a test checks it).
- No executables ship in the package: no `bin`, no network at run time.
- No exported identifier carries a family domain word (node as a graph node, aspect, horde, jarl, ticket, mission, loop). The guard enforces it; an exception goes into `guard.allow` with its reason, reviewed like code.
- `tools/vendor.mjs` is plain JavaScript with zero dependencies because consumers copy it verbatim. It runs on Node 22.
- Tests are `node:test` files in `test/`, run against the built `dist/` through the package's own exports. Tests that need git create throwaway repositories under the OS temp dir with an explicit identity.
- Never hard-wrap prose. A paragraph, list item or table row is one line in the file, however long; let the editor soft-wrap. This holds for Markdown, code comments and commit bodies alike.
- Releases: the owner bumps the version, updates `CHANGELOG.md`, pushes, and pushes the tag `vX.Y.Z`; `.github/workflows/release.yml` publishes. Agents never publish and never create or push tags.
