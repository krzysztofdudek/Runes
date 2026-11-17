---
id: rust-cfg-if-module-and-use-are-names-in-scope-edge
language: rust
category: trap
expectation: edge
cites: "Rust Reference — Names, Name resolution (a name an item or a `use` of the module brings in is found before the extern prelude); Use declarations (from edition 2018 a `use` path may start with a name in scope); cfg-if crate (`cfg_if!` expands to the items of the branch whose `cfg` holds); rustc 1.99.1 builds the fixture"
---

## Rule

With `datacrate = { path = "datacrate" }` in Cargo.toml, `src/lib.rs` declares `mod datacrate;` and `mod unix;` and writes `use unix as imp;` in a branch of `cfg_if!`. The branch's items are items of the module on the targets where it holds, so the names are in scope of the whole module as if written outside the macro: `datacrate::dc(1u8)` in a function body calls the `dc` of `src/datacrate.rs` (node `local`), whose result is `()` where the crate's is `u32`, and names no crate, so it gives no edge to `datacrate/src/lib.rs` (node `datacrate`); `use imp::g;` names `g` of `src/unix.rs` (node `unix`) through the alias. In `src/unix.rs` a `cfg_if!` branch declares `mod store;`, and `use store::put;` there names `src/unix/store.rs` (node `store`), where no crate is called `store`. The branch's `cfg` is `any(unix, windows)` so that the build reads every file on each platform the tests run on.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"

[dependencies]
datacrate = { path = "datacrate" }
cfg-if = "1"
```

```toml path=datacrate/Cargo.toml
[package]
name = "datacrate"
version = "0.1.0"
edition = "2021"
```

```rust path=datacrate/src/lib.rs owner=datacrate
pub fn dc(_x: u8) -> u32 { 0 }
```

```rust path=src/lib.rs owner=root
cfg_if::cfg_if! {
    if #[cfg(any(unix, windows))] {
        mod datacrate;
        mod unix;
        use unix as imp;
    }
}
use imp::g;
pub fn k() {
    let () = datacrate::dc(1u8);
    imp::g();
    g();
}
```

```rust path=src/datacrate.rs owner=local
pub fn dc(_x: u8) {}
```

```rust path=src/unix.rs owner=unix
cfg_if::cfg_if! {
    if #[cfg(any(unix, windows))] {
        mod store;
    }
}
use store::put;
pub fn g() { put(); }
```

```rust path=src/unix/store.rs owner=store
pub fn put() {}
```

## Expect

- src/lib.rs:3 -> node:local   # `mod datacrate;` in the branch
- src/lib.rs:4 -> node:unix   # `mod unix;` in the branch
- src/lib.rs:8 -> node:unix   # `use imp::g;`, through the alias the branch binds
- src/lib.rs:8 answers resolved src/unix.rs
- src/unix.rs:3 -> node:store   # `mod store;` in the branch
- src/unix.rs:6 -> node:store   # `use store::put;`, through the module the branch declares
- src/unix.rs:6 answers resolved src/unix/store.rs

## Why

A platform layer declares its modules and binds its alias in `cfg_if!`, whose body is tokens to the grammar. Read as no name in scope, `use imp::g;` and `use store::put;` named crates that do not exist and the edge to the module was lost, and `datacrate::dc(1u8)` named the path dependency `datacrate`, a false edge, while rustc binds the module the branch declares. A `use datacrate::dc;` beside that branch is no form a case can hold: rustc 1.99.1 refuses it (E0659), because a name a macro expands may not shadow a crate of the extern prelude while imports are resolved.
