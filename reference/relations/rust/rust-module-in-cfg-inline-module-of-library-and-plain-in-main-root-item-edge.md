---
id: rust-module-in-cfg-inline-module-of-library-and-plain-in-main-root-item-edge
language: rust
category: import
expectation: edge
cites: "Rust Reference, Conditional compilation (an item whose `cfg` predicate is false is removed from the crate); Rust Reference, Paths (`crate` is the root of the current crate)"
---

## Rule

`src/main.rs` declares `mod outer;` and `src/outer/mod.rs` declares `mod x;`, a chain of plain declarations down to `src/outer/x.rs`. `src/lib.rs` reaches the same file through `#[cfg(any())] mod outer { mod x; }`, an inline module that a `cfg` removes. The binary root is the one root that certainly compiles the file and is tried first: `crate::Opts`, which only `src/main.rs` holds, binds `src/main.rs` (owner bin).

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs owner=root
#[cfg(any())]
mod outer {
    mod x;
}
```

```rust path=src/main.rs owner=bin
mod outer;
struct Opts;
fn main() {}
```

```rust path=src/outer/mod.rs owner=outer
mod x;
```

```rust path=src/outer/x.rs owner=x
use crate::Opts;
```

## Expect

- src/lib.rs:3 -> node:x       # `mod x;` inside the library's inline module, under its `cfg`
- src/main.rs:1 -> node:outer  # `mod outer;` in the binary root
- src/outer/mod.rs:1 -> node:x # `mod x;` in the module
- src/outer/x.rs:1 -> node:bin

## Why

A declaration that a `cfg` may remove does not prove that its root compiles the file, so it is not one of the two roots that make a root item untold.
