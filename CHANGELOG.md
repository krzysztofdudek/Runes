# Changelog

All notable changes to Runes are recorded here, one line per change. Runes follows [Semantic Versioning](https://semver.org/); one version covers every subpath.

## [0.1.0] - 2026-09-27

- First release: the package skeleton with the subpaths `relations`, `ast`, `grammars`, `fs`, `cli`, `mcp` and `testkit`. Each holds a stub today; the relation extractor and the shared CLI, MCP and file-system code move in with later releases.
- `testkit`: the family guard, which fails when code imports another family tool, runs its executable, builds a path into its state directory, or exports an identifier carrying a family domain word; with a reviewed allow file.
- `grammars`: the grammar manifest format, with the `web-tree-sitter` runtime pinned to 0.27.0, and its validator. No grammars are pinned yet.
- `tools/vendor.mjs`: the vendoring tool consumers copy, with an offline sha256 gate, a fresh-clone gate for CI, `update` between tags, a local report for co-development, and skill fragments between markers.
