---
id: python-pytest-basedir-beside-src-edge
language: python
category: import
expectation: edge
cites: "pytest, Good Integration Practices and the prepend import mode: for a test module, pytest inserts the first directory upward that holds no `__init__.py`, the basedir, at the front of `sys.path`"
---

## Rule

A test module in a package `tests/unit/` (it holds `__init__.py`) whose parent `tests/` holds none has `tests/` inserted on `sys.path` by pytest, with no `conftest.py` needed. So `from helpers import make` binds `tests/helpers.py` and `from unit.common import c` binds `tests/unit/common.py`, though `tests/` lies inside the project beside `src/`.

## Files

```toml path=pyproject.toml
[project]
name = "app"
version = "0.1.0"
```

```python path=src/app/__init__.py
```

```python path=tests/helpers.py
def make():
    pass
```

```python path=tests/unit/__init__.py
```

```python path=tests/unit/common.py
c = 1
```

```python path=tests/unit/test_a.py
from helpers import make
from unit.common import c
```

## Expect

- tests/unit/test_a.py:1 -> node:tests      # pytest's basedir, tests/
- tests/unit/test_a.py:1 answers resolved tests/helpers.py
- tests/unit/test_a.py:2 answers resolved tests/unit/common.py

## Why

Judging roots against the project's directory took `tests/` from the test modules below it, though pytest itself puts it on `sys.path`; 1.1.0 bound both imports.
