---
id: rust-module-written-by-outside-macro-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Macros By Example (`#[macro_use] mod macros;` brings a macro into scope, and its expansion at the crate root writes `mod` items); Paths (`crate` is the root of the current crate)"
---

## Rule

`src/lib.rs` brings `decl_mods!` into scope from `src/macros.rs` and invokes it as `decl_mods!(late);`, and `src/main.rs` is a second crate with an `Opts` of its own. The `mod late;` exists only through an expansion of a macro defined in another file, which is not read, so no plain `mod` declaration leads from a root to `src/late/mod.rs`: the roots are tried in their usual order, and its `crate::Opts` binds `src/lib.rs` (owner root).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
#[macro_use]
mod macros;
decl_mods!(late);
pub struct Opts;
```

```rust path=src/macros.rs owner=macros
macro_rules! decl_mods {
    ($($name:ident),*) => {
        $(mod $name;)*
    };
}
```

```rust path=src/main.rs owner=bin
struct Opts;
fn main() {}
```

```rust path=src/late/mod.rs
use crate::Opts;
```

## Expect

- src/lib.rs:2 -> node:macros    # `mod macros;`
- src/late/mod.rs:1 -> node:root
