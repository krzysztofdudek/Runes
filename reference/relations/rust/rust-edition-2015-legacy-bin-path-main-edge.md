---
id: rust-edition-2015-legacy-bin-path-main-edge
language: rust
category: trap
expectation: edge
cites: "Cargo's own source, src/cargo/util/toml/targets.rs, `legacy_bin_path` (edition 2015 only: a `[[bin]]` with a name and no `path` that is not found in `src/bin` is built from `src/<name>.rs` when the package has no library, else `src/main.rs`, else `src/bin/main.rs`)"
---

## Rule

An edition 2015 package with a library declares `[[bin]] name = "cli"` with no `path`. `src/bin/cli.rs` does not exist and the library rules out `src/cli.rs`, so Cargo builds the bin from `src/main.rs`, which is a crate root: `use self::tools::Helper;` in it reaches `src/tools/mod.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"

[[bin]]
name = "cli"
```

```rust path=src/lib.rs
pub mod util;
```

```rust path=src/util.rs
pub struct Thing;
```

```rust path=src/main.rs
use self::tools::Helper;
```

```rust path=src/tools/mod.rs
pub struct Helper;
```

## Expect

- src/main.rs:1 -> node:tools          # legacy bin path: src/main.rs when the package has a library

## Why

The declared bin names a different binary than the package, so a reader that looks for `src/main.rs` only by the package's name loses a root Cargo builds.
