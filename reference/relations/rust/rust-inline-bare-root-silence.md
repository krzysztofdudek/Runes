---
id: rust-inline-bare-root-silence
language: rust
category: trap
expectation: silence
cites: "Rust Reference — Paths (2018+ bare leading segment is local-first / extern prelude); research Forms A13 / inline bare-root"
---

## Rule

An inline path rooted at a bare identifier that nothing in scope binds, `external::thing::Foo::bar()` in `src/c/run.rs`, names a crate of the extern prelude, not a module of the crate root: a name the root declares is not in scope of another module. The package's dependency `external` is a registry crate, so the path binds nothing, although `src/external/mod.rs` (node `external`) is a real mapped module whose name matches the leading segment.

## Files

```toml path=Cargo.toml
[package]
name = "mycrate"

[dependencies]
external = "1"
```

```rust path=src/external/mod.rs
pub struct Foo;
```

```rust path=src/c/run.rs
fn g() {
    external::thing::Foo::bar();
}
```

```rust path=src/c/mod.rs
pub mod run;
```

```rust path=src/lib.rs
pub mod c;
pub mod external;
```

## Expect

- silence      # the inline path names the registry crate `external`, which binds no file of the repository; no edge to node:external even though src/external/mod.rs exists
- src/lib.rs:1 -> node:c      # the module declaration of the completed crate
- src/lib.rs:2 -> node:external      # the module declaration of the completed crate

## Why

Resolving a bare leading segment by probing `src/<seg>.rs` would let a crate, or a name a `use` brings in, mis-bind to a same-named in-repo module: the cardinal false positive. Such a path is read as the compiler reads it, a crate of the extern prelude, which only a path dependency or the package's own library can bind.
