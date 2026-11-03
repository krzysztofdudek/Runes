---
id: rust-edition-2015-legacy-bin-path-bin-main-edge
language: rust
category: trap
expectation: edge
cites: "Cargo's own source, src/cargo/util/toml/targets.rs, `legacy_bin_path` (edition 2015 only: a `[[bin]]` with a name and no `path` that is not found in `src/bin` is built from `src/<name>.rs` when the package has no library, else `src/main.rs`, else `src/bin/main.rs`)"
---

## Rule

An edition 2015 package with a library declares `[[bin]] name = "cli"` with no `path`, and has neither `src/bin/cli.rs` nor `src/main.rs`. Cargo builds the bin from `src/bin/main.rs`, which is a crate root: `use self::tools::Helper;` in it reaches `src/bin/tools/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"

[[bin]]
name = "cli"
```

```rust path=src/lib.rs
pub mod other;
```

```rust path=src/other.rs
pub struct Thing;
```

```rust path=src/bin/main.rs
use self::tools::Helper;
```

```rust path=src/bin/tools/mod.rs
pub struct Helper;
```

## Expect

- src/bin/main.rs:1 -> node:tools          # legacy bin path: src/bin/main.rs when there is a library and no src/main.rs

## Why

The last fallback of Cargo's legacy path; without it the file is read as no root and its `self::` paths give no edge.
