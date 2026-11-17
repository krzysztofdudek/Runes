---
id: python-module-under-two-roots-ambiguous-silence
language: python
category: trap
expectation: silence
cites: "Python import system: the first `sys.path` entry that holds the module wins, and the order of installed projects on `sys.path` is not in the repository; PyPA src layout"
---

## Rule

Two projects of the repository, each with its own source root, both hold a module `shared.util`. Which one an importer outside both loads depends on the order the installed projects take on `sys.path`, which a static tool cannot know, so the import binds no file and gives no edge. `classifyUse` answers it ambiguous, naming both files, sorted.

## Files

```toml path=a/pyproject.toml
[project]
name = "a"
```

```python path=a/src/shared/__init__.py
```

```python path=a/src/shared/util.py
def run():
    pass
```

```toml path=b/pyproject.toml
[project]
name = "b"
```

```python path=b/src/shared/__init__.py
```

```python path=b/src/shared/util.py
def run():
    pass
```

```python path=c/app/main.py
import shared.util
```

## Expect

- silence      # two roots hold shared.util: no edge
- c/app/main.py:1 answers ambiguous a/src/shared/util.py, b/src/shared/util.py

## Why

Before, the use was answered absent, unfollowed, as if no file held the module, so a consumer could neither judge the two candidates nor tell the use from one that names no file.
