---
id: rust-module-written-by-raw-identifier-macro-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Identifiers (a raw identifier `r#name`); Macros By Example; Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` invokes a macro of `src/macros.rs` by a raw identifier, `r#decl!(late);`, which writes `mod late;`. `src/main.rs` is a second crate with an `Opts` of its own. No plain `mod late;` leads from a root to `src/late/mod.rs`, so the roots are tried in their usual order, and `crate::Opts` binds `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
#[macro_use]
mod macros;
r#decl!(late);
pub struct Opts;
```

```rust path=src/macros.rs owner=macros
macro_rules! decl {
    ($name:ident) => {
        mod $name;
    };
}
```

```rust path=src/main.rs owner=bin
struct Opts;
fn main() {}
```

```rust path=src/late/mod.rs owner=late
use crate::Opts;
```

## Expect

- src/lib.rs:2 -> node:macros    # `mod macros;`
- src/late/mod.rs:1 -> node:root
