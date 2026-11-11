---
id: rust-crate-path-root-name-in-string-or-nested-fn-silence
language: rust
category: trap
expectation: silence
cites: "Rust Reference — Macros by example, path-based scope (`#[macro_export]` places the macro in the crate root namespace wherever it is defined); Tokens, String literals; Items (an item declared in a function body is no item of the module around it)"
---

## Rule

`use crate::ensure;` names what the crate root binds as `ensure`. Here that is a `#[macro_export]` macro defined in `src/macros/mod.rs`, which no path pins to a file. The crate root file `src/lib.rs` (node `src`) mentions `fn ensure` twice, in a string literal and as a function nested in the body of another function; neither is an item of the crate root, so the root file is not bound and the `use` stays silent.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
```

```rust path=src/lib.rs
mod macros;
pub const HELP: &str = "call fn ensure first";
fn setup() {
    fn ensure() {}
    ensure();
}
```

```rust path=src/macros/mod.rs owner=src
#[macro_export]
macro_rules! ensure {
    () => {};
}
```

```rust path=src/api/mod.rs
use crate::ensure;
```

## Expect

- silence      # `ensure` is in a string and in a nested fn of src/lib.rs, never an item of the crate root → no edge to node:src

## Why

Reading the root file's text for `fn ensure` takes a word in a string, or a function local to another function, for an item of the crate root, and pins the exported macro on the root file. Where the root also declares the importing module, that false edge closes a cycle between the two nodes.
