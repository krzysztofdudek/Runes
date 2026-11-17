---
id: python-config-root-setup-cfg-package-dir-edge
language: python
category: import
expectation: edge
cites: "setuptools, Configuring setuptools using setup.cfg files: `[options] package_dir` maps the root package (the empty name) to a directory, which the installed project puts on `sys.path`"
---

## Rule

A project whose `setup.cfg` maps the empty package name to `lib` under `[options] package_dir` (`= lib`) has its packages in `lib/`, and installing it puts `lib/` on `sys.path`. `lib/` is then the project's source root, so the absolute imports of the package resolve under it.

## Files

```ini path=setup.cfg
[metadata]
name = shop

[options]
package_dir =
    = lib
packages = find:
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
```

```python path=tests/test_store.py
from shop.data.store import load
```

## Expect

- lib/shop/ui/view.py:1 -> node:data      # lib/ is the root package_dir names
- lib/shop/ui/view.py:2 -> node:data
- tests/test_store.py:1 -> node:data
- lib/shop/ui/view.py:1 answers resolved lib/shop/data/store.py
- lib/shop/ui/view.py:2 answers resolved lib/shop/data/store.py
- tests/test_store.py:1 answers resolved lib/shop/data/store.py

## Why

A `setup.cfg` is the older home of the same setting; without its text the package's own name was answered outside.
