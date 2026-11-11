---
id: rust-module-in-cfg-if-of-lib-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Paths (`crate` is the root of the current crate); the cfg-if crate (a `mod` written inside `cfg_if! { … }` is a module of the file that invokes it)"
---

## Rule

`src/lib.rs` declares `mod unix;` inside `cfg_if! { … }`, and `src/main.rs` is a second crate with an `Opts` of its own. `src/unix/mod.rs` is a module of the library, so its `crate::Opts` binds `src/lib.rs` (owner root), as it did before the crate root was told by the module's declaration. A declaration the reader does not see leaves the choice to the first root.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
cfg_if! {
    if #[cfg(unix)] {
        mod unix;
    } else {
        mod other;
    }
}
pub struct Opts;
```

```rust path=src/main.rs owner=bin
struct Opts;
fn main() {}
```

```rust path=src/unix/mod.rs
use crate::Opts;
```

## Expect

- src/unix/mod.rs:1 -> node:root
