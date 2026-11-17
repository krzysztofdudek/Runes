---
id: python-test-fixture-project-roots-only-itself-edge
language: python
category: import
expectation: edge
cites: "Python Packaging User Guide, Installing packages: only an installed project's source roots join `sys.path`; pytest, Good Integration Practices: test files and their data live under `tests/`, and nothing installs a project kept there as test data"
---

## Rule

A project manifest in a test fixture directory (a directory named `tests`, `test` or `fixtures`, or below one) describes a sample project the tests read or build, not a project installed beside the repository's own. Its source root serves only the files inside the fixture: from there its modules resolve as before, and from anywhere else a name it holds is what an installed package or the standard library gives, so `import build` in the tool's own code is the PyPA `build` package, not the fixture's `build.py`.

## Files

```toml path=pyproject.toml
[project]
name = "tool"
version = "0.1.0"
```

```python path=src/tool/__init__.py
```

```python path=src/tool/chef.py
import build
```

```toml path=tests/fixtures/sample/pyproject.toml
[tool.poetry]
name = "sample"
version = "0.1.0"
```

```python path=tests/fixtures/sample/build/__init__.py
def run():
    pass
```

```python path=tests/fixtures/sample/app/main.py
import build
```

## Expect

- src/tool/chef.py:1 answers absent outside                    # the installed build package, not the fixture's module
- tests/fixtures/sample/app/main.py:1 -> node:build            # inside the fixture its own root still binds
- tests/fixtures/sample/app/main.py:1 answers resolved tests/fixtures/sample/build/__init__.py

## Why

A fixture that holds a module named like an installed package captured every import of that package in the repository: a false edge into test data with one such fixture, and an ambiguity with several (poetry's three `build.py` fixtures).
