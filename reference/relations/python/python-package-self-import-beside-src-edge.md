---
id: python-package-self-import-beside-src-edge
language: python
category: import
expectation: edge
cites: "Python Language Reference, The import system, 5.4 (a package's submodules are found on its `__path__`): a file that runs as part of package `myext` at all has the directory above `myext` on `sys.path`, so `myext.util` imported from inside `myext` is that package's own submodule"
---

## Rule

A package beside the project's `src/`, here a Sphinx extension in `docs/_ext/myext/`, that imports its own submodule by its absolute name (`from myext.util import helper` inside `myext`) can only run as `myext` with `docs/_ext/` on `sys.path`, so the import binds the package's own submodule, although `docs/_ext/` lies inside the project and is no root for other imports.

## Files

```toml path=pyproject.toml
[project]
name = "app"
version = "0.1.0"
```

```python path=src/app/__init__.py
```

```python path=docs/_ext/myext/__init__.py
from myext.util import helper
```

```python path=docs/_ext/myext/util/__init__.py
def helper():
    pass
```

## Expect

- docs/_ext/myext/__init__.py:1 -> node:util      # the package's own submodule, through the directory above it
- docs/_ext/myext/__init__.py:1 answers resolved docs/_ext/myext/util/__init__.py

## Why

Judging roots against the project's directory took `docs/_ext/` from every import below it, and with it the package's imports of itself, which 1.1.0 bound; outside would claim the package leaves the repository.
