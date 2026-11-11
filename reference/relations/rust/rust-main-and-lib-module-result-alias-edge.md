---
id: rust-main-and-lib-module-result-alias-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Paths (`crate` is the root of the current crate); Cargo targets.rs inferred_lib, inferred_bins (src/lib.rs and src/main.rs are two crates)"
---

## Rule

The common shape of p46 with `Result`: `src/lib.rs` has `pub type Result<T> = …;` and declares `mod store;`; `src/main.rs` has its own `type Result<T> = …;` and declares `mod cmd;`. In the binary's `src/cmd/mod.rs`, `crate::Result` is `src/main.rs` (owner bin); in the library's `src/store/mod.rs` it is `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
mod store;
pub type Result<T> = std::result::Result<T, ()>;
```

```rust path=src/main.rs owner=bin
mod cmd;
type Result<T> = std::result::Result<T, String>;
fn main() {}
```

```rust path=src/cmd/mod.rs
use crate::Result;
```

```rust path=src/store/mod.rs
use crate::Result;
```

## Expect

- src/lib.rs:1 -> node:store
- src/main.rs:1 -> node:cmd
- src/cmd/mod.rs:1 -> node:bin
- src/store/mod.rs:1 -> node:root
