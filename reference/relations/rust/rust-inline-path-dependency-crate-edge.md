---
id: rust-inline-path-dependency-crate-edge
language: rust
category: usage-site
expectation: edge
cites: "Rust Reference — Names, Preludes, Extern prelude (the crates passed to the compiler, which Cargo does for every dependency, are in scope of every module without a `use`); Names, Name resolution (a name an item or a `use` of the module brings in is found before the extern prelude); rustc 1.99.1 builds the fixture"
---

## Rule

With `datacrate = { path = "datacrate" }` in Cargo.toml, `datacrate::dc()` written in a function body, with no `use`, calls the function `dc` of that crate, which is `datacrate/src/lib.rs` (node `datacrate`), and so does the type `datacrate::Data` in a signature. `std::mem::swap` and `kit::spin()`, whose crate is a registry dependency, leave the repository and give no edge. In `src/shadow.rs` the same words `datacrate::local()` name the module `mod datacrate;` that file declares, `src/shadow/datacrate.rs` (node `local`), because a name of the module is found before a crate of that name: the path names no crate and gives no edge to `datacrate/src/lib.rs`.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
datacrate = { path = "datacrate" }
kit = "1"
```

```toml path=datacrate/Cargo.toml
[package]
name = "datacrate"
version = "0.1.0"
edition = "2021"
```

```rust path=datacrate/src/lib.rs owner=datacrate
pub fn dc() {}
pub struct Data;
```

```rust path=src/lib.rs owner=root
use kit::spin;
mod shadow;
pub fn k() {
    datacrate::dc();
    let (mut a, mut b) = (1, 2);
    std::mem::swap(&mut a, &mut b);
    kit::spin();
}
pub fn t(_d: datacrate::Data) {}
```

```rust path=src/shadow.rs owner=shadow
mod datacrate;
pub fn s() {
    datacrate::local();
}
```

```rust path=src/shadow/datacrate.rs owner=local
pub fn local() {}
```

## Expect

- src/lib.rs:2 -> node:shadow   # `mod shadow;`
- src/lib.rs:4 -> node:datacrate   # a call through the name of a path dependency, with no `use`
- src/lib.rs:9 -> node:datacrate   # a type through the name of a path dependency
- src/shadow.rs:1 -> node:local   # `mod datacrate;`
- src/lib.rs:4 answers resolved datacrate/src/lib.rs
- src/lib.rs:6 answers absent outside
- src/lib.rs:7 answers absent outside

## Why

A path written in code started a use only at `crate`, `self` or `super`, so a function that calls a path dependency through the crate's name, the more common spelling, had no edge to it while the same call through `crate::` had one. A name in scope of the module, a module the file declares here, is read first, so a local module never gives an edge to the crate of its name.
