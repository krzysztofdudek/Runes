---
id: python-config-root-pyproject-where-edge
language: python
category: import
expectation: edge
cites: "setuptools, Configuring setuptools using pyproject.toml files: `[tool.setuptools.packages.find] where` lists the directories the packages are found in, and the installed project puts them on `sys.path`"
---

## Rule

A project whose `pyproject.toml` names `where = ["lib"]` under `[tool.setuptools.packages.find]` has its packages in `lib/`, and installing it puts `lib/` on `sys.path`. `lib/` is then the project's source root, in place of its `src/` child or the project directory, so the absolute imports of the package, from inside it and from the tests beside it, resolve under `lib/`, as the relative ones always did.

## Files

```toml path=pyproject.toml
[project]
name = "shop"
version = "0.1.0"

[tool.setuptools.packages.find]
where = ["lib"]
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
from shop.data.store import load
import shop.data.store
from ..data.store import load as load_again
```

```python path=tests/test_store.py
from shop.data.store import load
```

## Expect

- lib/shop/ui/view.py:1 -> node:data      # lib/ is the root the configuration names
- lib/shop/ui/view.py:2 -> node:data
- lib/shop/ui/view.py:3 -> node:data
- tests/test_store.py:1 -> node:data      # the tests beside lib/ reach it through the same root
- lib/shop/ui/view.py:1 answers resolved lib/shop/data/store.py
- lib/shop/ui/view.py:2 answers resolved lib/shop/data/store.py
- lib/shop/ui/view.py:3 answers resolved lib/shop/data/store.py
- tests/test_store.py:1 answers resolved lib/shop/data/store.py

## Why

Without the manifest's text the readers took the package's own name for an installed package: `shop.data.store` was answered outside while `..data.store` resolved, so a consumer reported nothing for the most common way to write the import.
