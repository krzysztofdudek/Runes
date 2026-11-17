---
id: python-own-namespace-dir-under-root-not-a-root-edge
language: python
category: import
expectation: edge
cites: "Python Language Reference, The import system, 5.5 (the path based finder searches `sys.path`) and PEP 420 (a directory without `__init__.py` under a `sys.path` entry is a namespace package); Python docs, sys.path: the script's own directory is prepended only when a file runs as a script"
---

## Rule

A file in a package directory below a discovered source root (`src/poetry/`, a namespace package with no `__init__.py`) is imported through that root, not run as a script, so its own directory is not on `sys.path`. `poetry.json` in `src/poetry/factory.py` is then the `poetry` package under `src/`, and the module `src/poetry/poetry.py` beside the importing file does not compete with it as if `src/poetry/` were a root.

## Files

```toml path=pyproject.toml
[tool.poetry]
name = "poetry"
version = "2.0.0"
packages = [{ include = "poetry", from = "src" }]
```

```python path=src/poetry/__version__.py
__version__ = "2.0.0"
```

```python path=src/poetry/poetry.py
class Poetry:
    pass
```

```python path=src/poetry/json/__init__.py
def validate():
    pass
```

```python path=src/poetry/factory.py
from poetry.json import validate
from poetry.__version__ import __version__
from poetry.poetry import Poetry
```

## Expect

- src/poetry/factory.py:1 -> node:json      # the poetry package under src/, not src/poetry/poetry.py
- src/poetry/factory.py:1 answers resolved src/poetry/json/__init__.py
- src/poetry/factory.py:2 answers resolved src/poetry/__version__.py
- src/poetry/factory.py:3 answers resolved src/poetry/poetry.py

## Why

Searching the importing file's own directory as a root made `src/poetry/poetry.py` answer for every `poetry.x` import of the files beside it, so each such use was ambiguous with no edge, and in `src/poetry/poetry.py` itself one of the two candidates was the importing file.
