---
id: rust-edition-2015-crate-named-like-root-module-edge
language: rust
category: trap
expectation: edge
cites: "Rust Edition Guide, Path and module system changes (in edition 2015 a use path is relative to the crate root)"
---

## Rule

Edition 2015 (the package gives none). The package is named `parser`, and its root `src/lib.rs` declares `pub mod parser;`. In edition 2015 a `use` path starts at the crate root, and the package's own name is no crate there, so `use parser::Marker;` in `src/user.rs` names the root's module `parser`, `src/parser.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "parser"
```

```rust path=src/lib.rs owner=root
pub mod parser;
mod user;
```

```rust path=src/parser.rs owner=parse
pub struct Marker;
```

```rust path=src/user.rs owner=user
use parser::Marker;
pub fn mark() -> Marker {
    Marker
}
```

## Expect

- src/lib.rs:1 -> node:parse
- src/lib.rs:2 -> node:user
- src/user.rs:1 -> node:parse   # `parser` as the crate root binds it

## Why

Reading the package's own name as its library before the crate root's names misses the module rustc names.
