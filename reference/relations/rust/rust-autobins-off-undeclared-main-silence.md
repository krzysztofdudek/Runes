---
id: rust-autobins-off-undeclared-main-silence
language: rust
category: import
expectation: silence
cites: "The Cargo Book — Target auto-discovery (`autobins = false` turns off inferring `src/main.rs` and `src/bin/` as binaries; a binary then exists only as a declared [[bin]])"
---

## Rule

With `autobins = false`, `src/main.rs` is a crate root only when a `[[bin]]` declares it (by `path = "src/main.rs"`, or by a name equal to the package's name). Here none does, so the file belongs to no crate: it is no root whose `self::` reaches the module files beside it, and `use self::tools::Helper;` in it binds nothing.

## Files

```toml path=Cargo.toml
[package]
name = "app"
edition = "2021"
autobins = false
```

```rust path=src/lib.rs
pub mod util;
```

```rust path=src/util.rs
pub struct Thing;
```

```rust path=src/tools/mod.rs
pub struct Helper;
```

```rust path=src/main.rs
use self::tools::Helper;
```

## Expect

- silence      # no [[bin]] declares src/main.rs: it is no crate root, so `self::tools` is not src/tools/mod.rs

## Why

Reading `src/main.rs` as a crate root whatever `autobins` says gives edges to the modules beside a file that Cargo does not compile as a binary.
