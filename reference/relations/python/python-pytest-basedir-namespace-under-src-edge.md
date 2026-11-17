---
id: python-pytest-basedir-namespace-under-src-edge
language: python
category: import
expectation: edge
cites: "pytest, the prepend import mode: a test module in a directory without `__init__.py` is its own basedir, which pytest inserts at the front of `sys.path`"
---

## Rule

A test module in a namespace directory below `src/` (`src/app_tests/` has no `__init__.py`) is imported by pytest with its own directory inserted on `sys.path`. Its directory is then a root for its imports, though a package directory below `src/` is otherwise imported through `src/` and not searched as a root of its own.

## Files

```toml path=pyproject.toml
[project]
name = "app"
version = "0.1.0"
```

```python path=src/app/__init__.py
```

```python path=src/app_tests/support/__init__.py
```

```python path=src/app_tests/support/data.py
def load():
    pass
```

```python path=src/app_tests/test_x.py
from support.data import load
```

## Expect

- src/app_tests/test_x.py:1 -> node:support      # pytest's basedir, the test module's own directory
- src/app_tests/test_x.py:1 answers resolved src/app_tests/support/data.py

## Why

The rule that keeps a package directory below `src/` from being a root took the test module's own directory too, which pytest inserts; 1.1.0 bound the import.
