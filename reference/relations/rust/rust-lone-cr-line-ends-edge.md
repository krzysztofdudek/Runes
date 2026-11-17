---
id: rust-lone-cr-line-ends-edge
language: rust
category: trap
expectation: edge
cites: "The Rust Reference, Whitespace (a carriage return is white space); research 2026-11-15 readers gaps, lone CR lines"
---

## Rule

Rust reads a lone CR between items as white space, so a file with old Mac line ends builds; an editor still shows it on as many lines as it has line ends. Tree-sitter counts rows by LF alone, so in a file whose lines end with a lone CR every node sits on row 0; the line a use reports is the line an editor shows, counted by LF, CRLF and lone CR alike, so that a message points at the line of the use and a waiver written on that line matches it.

## Files

```toml path=Cargo.toml
[package]
name = "mycrate"
```

```rust path=src/orders/foo/mod.rs
pub struct X;
```

```rust path=src/orders/mod.rs eol=cr
pub struct A;

mod foo;
```

```rust path=src/lib.rs
pub mod orders;
```

## Expect

- src/orders/mod.rs:3 -> node:foo      # `mod foo;` on the third line as an editor shows it reports line 3, never line 1
- src/lib.rs:1 -> node:orders      # the module declaration of the completed crate

## Why

At v1.1.0 the line was the tree-sitter row plus one, and the whole file is row 0, so the use was reported on line 1. The Rust compiler counts lines by LF alone; the line reported here is the editor's, where a person reads the message and writes a waiver.
