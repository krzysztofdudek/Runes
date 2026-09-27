# Changelog

All notable changes to Runes are recorded here, one line per change. Runes follows [Semantic Versioning](https://semver.org/); one version covers every subpath.

## [0.1.0] - 2026-09-27

- First release: the package with the subpaths `relations`, `ast`, `grammars`, `fs`, `cli`, `mcp` and `testkit`. `relations`, `ast`, `grammars` and `testkit` carry code (below); `fs`, `cli` and `mcp` are stubs, and the shared file-system, CLI and MCP code moves in with later releases.
- `testkit`: the family guard, which fails when code imports another family tool, runs its executable, builds a path into its state directory, or exports an identifier carrying a family domain word; with a reviewed allow file.
- `relations`: moved from Yggdrasil: the extractors of 11 languages, the symbol table, the three-state resolver (`ownerNode` is now `owner`; the owner lookup is an injected `{ ownerOf(file) }`), `makeResolvePathToFile` (without Yggdrasil's graph-bound wrapper) and the repository layout. `ParsedFile.newParser` injects the parser Kotlin recovery needs.
- `ast`: `walk`, `closest`, the parse cache, and `createParserHost`, a parser host over an injected `web-tree-sitter` runtime and runtime identity; no module imports the runtime by value.
- `grammars`: the grammar manifest format and its validator; the manifest pins the union of Yggdrasil's and Grain's grammars (23), the runtime and `tree-sitter-cli` 0.27.0; the four TypeScript patches; `buildGrammars` (fetch, patch, build, sha256-verify, content-addressed cache, `only`) and `verifyGrammarFiles`; the language table. PHP is the `php` grammar, not `php_only`. The manifest format gained `cli`, source builds with `dir`, `generate`, `patches` and `deps`, and npm sources with `wasmPath` and `nodeTypesPath`.
- `testkit`: `checkRuntimePins`, which fails a consumer whose `web-tree-sitter` or npm grammar packages differ from the manifest.
- The 460-case relation catalogue (`reference/relations/`) with its runner, and the extractor, symbol-table, resolver, path, registry, candidate-parity, C# parity and extractor-rev tests, moved from Yggdrasil.
- `tools/vendor.mjs`: the vendoring tool consumers copy, with an offline sha256 gate, a fresh-clone gate for CI, `update` between tags, a local report for co-development, and skill fragments between markers.
