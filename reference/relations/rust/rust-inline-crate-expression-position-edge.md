---
id: rust-inline-crate-expression-position-edge
language: rust
category: usage-site
expectation: edge
cites: "Rust Reference — Paths in expressions (`crate::a::f()` call); research Form D4 / inline expression-position"
---

## Rule

A fully-qualified path written inline in an EXPRESSION position — an
associated-fn / free-fn call `crate::logging::init()` — parses as a
`scoped_identifier` rooted at `crate`. The same crate-relative shadow-free guarantee
as the type-position form applies: a `crate`/`self`/`super`-rooted expression path
resolves deterministically through the module tree. Here `crate::logging::init`
resolves to `src/logging/mod.rs` (init is an item in module `logging`), node `logging`.

## Files

```toml path=Cargo.toml
[package]
name = "mycrate"
```

```rust path=src/logging/mod.rs
pub fn init() {}
```

```rust path=src/c/run.rs
fn g() {
    crate::logging::init();
}
```

```rust path=src/c/mod.rs
pub mod run;
```

```rust path=src/lib.rs
pub mod c;
pub mod logging;
```

## Expect

- src/c/run.rs:2 -> node:logging      # inline expression-position crate::logging::init → src/logging/mod.rs (node logging)
- src/lib.rs:1 -> node:c      # the module declaration of the completed crate
- src/lib.rs:2 -> node:logging      # the module declaration of the completed crate

## Why

The expression path is crate-absolute and shadow-free; the leading `crate` makes it
unambiguous, so the call site establishes a real edge without any import.
