---
id: python-workspace-member-tests-package-edge
language: python
category: import
expectation: edge
cites: "pytest, Good Integration Practices and the prepend import mode: for a test module inside packages, pytest inserts the first directory upward that holds no `__init__.py`, the basedir, at the front of `sys.path`"
---

## Rule

A workspace member below a root manifest keeps its code in `src/` and its tests in a `tests` package beside it. pytest inserts the member's directory, the first one above the test module without `__init__.py`, so `tests.support.helpers` is importable from the tests. The member's directory is a project's directory, so it stays a root although it lies below the root project.

## Files

```toml path=pyproject.toml
[tool.uv.workspace]
members = ["member"]
```

```toml path=member/pyproject.toml
[project]
name = "member"
version = "0.1.0"
```

```python path=member/src/mpkg/__init__.py
```

```python path=member/tests/__init__.py
```

```python path=member/tests/support/__init__.py
```

```python path=member/tests/support/helpers.py
def make():
    pass
```

```python path=member/tests/unit/__init__.py
```

```python path=member/tests/unit/test_core.py
from tests.support.helpers import make
```

## Expect

- member/tests/unit/test_core.py:1 -> node:support      # pytest's basedir, the member's directory
- member/tests/unit/test_core.py:1 answers resolved member/tests/support/helpers.py

## Why

Judged against the source roots only, the member's directory lay below the root project's root and was no root, so every `tests.x` import of a member's tests lost its edge.
