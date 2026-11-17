---
id: python-config-root-maturin-python-source-edge
language: python
category: import
expectation: edge
cites: "maturin user guide, Project layout: in a mixed Rust and Python project, `[tool.maturin] python-source` names the directory that holds the Python package, and the installed project puts it on `sys.path`"
---

## Rule

A mixed Rust and Python project built by maturin keeps its Python package in the directory `[tool.maturin] python-source` names, here `python/`. Installing the project puts that directory on `sys.path`, so it is the project's source root, and the absolute imports of the package, from inside it and from the tests beside it, resolve under `python/`.

## Files

```toml path=Cargo.toml
[package]
name = "shop"
version = "0.1.0"
edition = "2021"
```

```toml path=pyproject.toml
[build-system]
requires = ["maturin>=1.0,<2.0"]
build-backend = "maturin"

[project]
name = "shop"

[tool.maturin]
python-source = "python"
module-name = "shop._native"
```

```python path=python/shop/__init__.py
```

```python path=python/shop/data/__init__.py
```

```python path=python/shop/data/store.py
def load():
    pass
```

```python path=python/shop/ui/__init__.py
```

```python path=python/shop/ui/view.py
from shop.data.store import load
```

```python path=tests/test_store.py
from shop.data.store import load
```

## Expect

- python/shop/ui/view.py:1 -> node:data      # python/ is the root python-source names
- tests/test_store.py:1 -> node:data
- python/shop/ui/view.py:1 answers resolved python/shop/data/store.py
- tests/test_store.py:1 answers resolved python/shop/data/store.py

## Why

Without the key the project's directory was its root, so the package's own name read as an installed package and every absolute self-import of a maturin project was answered outside.
