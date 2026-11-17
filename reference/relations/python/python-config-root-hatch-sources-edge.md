---
id: python-config-root-hatch-sources-edge
language: python
category: import
expectation: edge
cites: "Hatch, Build configuration, Rewriting paths: `sources = [\"lib\"]` under `[tool.hatch.build.targets.wheel]` drops the `lib/` prefix, so the installed project puts `lib/` on `sys.path`"
---

## Rule

A project built by Hatch whose wheel target writes `sources = ["lib"]` installs what `lib/` holds at the top of the wheel, so `lib/` is the project's source root and the absolute imports of its package resolve under it.

## Files

```toml path=pyproject.toml
[project]
name = "shop"
version = "0.1.0"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
sources = ["lib"]
```

```python path=lib/shop/__init__.py
```

```python path=lib/shop/data/__init__.py
```

```python path=lib/shop/data/store.py
def load():
    pass
```

```python path=lib/shop/ui/__init__.py
```

```python path=lib/shop/ui/view.py
from shop.data import store
```

## Expect

- lib/shop/ui/view.py:1 -> node:data      # lib/ is the root sources names
- lib/shop/ui/view.py:1 answers resolved lib/shop/data/store.py

## Why

Without the option the project's directory was its root, so the absolute imports of the package were answered outside.
