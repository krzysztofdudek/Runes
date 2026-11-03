---
id: rust-edition-2015-use-crate-root-item-string-brace-silence
language: rust
category: trap
expectation: silence
cites: "The Rust Edition Guide — Path and module system changes (in edition 2015 a `use` path is relative to the crate root, so it can name an item the crate root itself defines, not one defined inside a function body); The Rust Reference — String literals (a brace inside a literal is text)"
---

## Rule

A `}` inside a string or character literal in a function body of the crate root does not close that body. A struct declared later in the same body is still not an item of the crate root, so `use Local;` binds nothing and stays silent.

## Files

```toml path=Cargo.toml
[package]
name = "app"
```

```rust path=src/lib.rs
pub fn build() {
    let close = "}";
    let brace = '}';
    struct Local;
}
```

```rust path=src/api/client.rs
use Local;
```

## Expect

- silence      # `Local` lives in the body of `build`, whose braces a literal `}` does not close

## Why

Counting a brace inside a literal as code ends the function body early and reads the items declared after it as top-level items of the root, which gives an edge from every file whose `use` starts with such a name.
