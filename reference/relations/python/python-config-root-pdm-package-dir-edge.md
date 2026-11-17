---
id: python-config-root-pdm-package-dir-edge
language: python
category: import
expectation: edge
cites: "PDM backend, Build configuration: `[tool.pdm.build] package-dir` names the directory that holds the packages, and the installed project puts it on `sys.path`"
---

## Rule

A project built by the PDM backend with `[tool.pdm.build] package-dir = "lib"` keeps its packages in `lib/`, and installing it puts `lib/` on `sys.path`. `lib/` is then the project's source root, so the absolute imports of the package resolve under it.

## Files

```toml path=pyproject.toml
[project]
name = "shop"
version = "0.1.0"

[build-system]
requires = ["pdm-backend"]
build-backend = "pdm.backend"

[tool.pdm.build]
package-dir = "lib"
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
import shop.data.store
```

## Expect

- lib/shop/ui/view.py:1 -> node:data      # lib/ is the root package-dir names
- lib/shop/ui/view.py:1 answers resolved lib/shop/data/store.py

## Why

Without the key the project's directory was its root, so `shop.data.store` was answered outside while the same module written relatively resolved.
