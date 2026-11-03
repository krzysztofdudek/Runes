---
id: rust-edition-2015-legacy-bin-path-no-lib-edge
language: rust
category: trap
expectation: edge
cites: "Cargo's own source, src/cargo/util/toml/targets.rs, `legacy_bin_path` (edition 2015 only: a `[[bin]]` with a name and no `path` that is not found in `src/bin` is built from `src/<name>.rs` when the package has no library, else `src/main.rs`, else `src/bin/main.rs`)"
---

## Rule

An edition 2015 package declares `[[bin]] name = "cli"` with no `path`, and has no library and no `src/bin/cli.rs`. Cargo builds the bin from `src/cli.rs`, so that file is a crate root and `use self::tools::Helper;` in it reaches `src/tools/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"

[[bin]]
name = "cli"
```

```rust path=src/cli.rs
use self::tools::Helper;
```

```rust path=src/tools/mod.rs
pub struct Helper;
```

## Expect

- src/cli.rs:1 -> node:tools          # legacy bin path: src/<name>.rs is the root when there is no library

## Why

With bin auto-discovery off for a declared bin, reading only `src/bin` and `src/main.rs` as roots drops the edges of a layout Cargo still builds.
