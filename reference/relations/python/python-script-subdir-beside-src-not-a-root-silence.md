---
id: python-script-subdir-beside-src-not-a-root-silence
language: python
category: import
expectation: silence
cites: "Python docs, sys.path initialization: running `python scripts/sub/run.py` prepends the script's own directory, `scripts/sub`, and no directory above it"
---

## Rule

A project at the repository root whose code sits in `src/` keeps its script folders beside `src/`. A script in `scripts/sub/` has `scripts/sub/` on `sys.path` when it runs, and `scripts/` is no more a root for it than any other directory inside the project, so `import util` there does not bind `scripts/util.py`. It is what an installed package would give.

## Files

```toml path=pyproject.toml
[project]
name = "app"
version = "0.1.0"
```

```python path=src/app/__init__.py
```

```python path=scripts/util.py
def helper():
    pass
```

```python path=scripts/sub/run.py
import util
```

## Expect

- silence
- scripts/sub/run.py:1 answers absent outside      # scripts/ is a directory inside the project, not a root

## Why

Whether a directory is a root was judged against the source roots only, so beside `src/` the directory `scripts/` counted as a root for its subdirectories and bound a module Python would not load.
