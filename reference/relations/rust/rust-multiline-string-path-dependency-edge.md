---
id: rust-multiline-string-path-dependency-edge
language: rust
category: import
expectation: edge
cites: "The Cargo Book — Specifying dependencies (path dependencies, renaming with `package`); TOML 1.0 — String (multi-line basic and literal strings; a newline right after the opening delimiter is trimmed); Runes issue 173"
---

## Rule

A dependency's `path` is a TOML string, and a multi-line string is one too: `path = """../engine"""` and `path = '''` followed by `../geo'''` on the next line name `../engine` and `../geo` (TOML drops the newline right after the opening delimiter). So they resolve as the one-line forms do. In `crates/app/src/cmd/run.rs`, `engine::Motor` binds the library root of the dependency renamed with `package = "engine"`, `crates/engine/motor/lib.rs` (node `motor`), never the `Motor` of the importing package's own library `crates/app/src/lib.rs` (node `src`), and `geo::shapes::Circle` binds `crates/geo/src/shapes/mod.rs` (node `shapes`).

## Files

```toml path=crates/app/Cargo.toml
[package]
name = "app"

[dependencies]
engine = { path = """../engine""", package = "engine" }
geo = { path = '''
../geo''' }
```

```toml path=crates/engine/Cargo.toml
[package]
name = "engine"

[lib]
path = "motor/lib.rs"
```

```toml path=crates/geo/Cargo.toml
[package]
name = "geo"
```

```rust path=crates/app/src/lib.rs
pub struct Motor;
```

```rust path=crates/engine/motor/lib.rs
pub struct Motor;
```

```rust path=crates/geo/src/shapes/mod.rs
pub struct Circle;
```

```rust path=crates/app/src/cmd/run.rs
use engine::Motor;
use geo::shapes::Circle;
```

## Expect

- crates/app/src/cmd/run.rs:1 -> node:motor    # `path = """../engine"""` → crates/engine, never the importing package itself (crates/app/src/lib.rs, node:src)
- crates/app/src/cmd/run.rs:2 -> node:shapes   # `path = '''` + newline + `../geo'''` → crates/geo/src/shapes/mod.rs

## Why

A reader that takes the first pair of quotes of `"""../engine"""` for an empty string makes the package its own dependency: a renamed dependency then resolves into the importing crate, a false edge, and any other one stays silent.
