---
id: python-unresolved-outside-or-unfollowed-silence
language: python
category: trap
expectation: silence
cites: "Python import system (sys.path: the script's directory, the standard library, installed packages); PEP 328 relative imports"
---

## Rule

An absolute import whose top-level name no root of the repository holds (the standard library, an installed package) leaves the repository: absent, `outside`. A relative import with no module, and an import under a top-level package the repository holds that binds no module, point into the repository: absent, `unfollowed`.

## Files

```python path=mypkg/__init__.py
```

```python path=mypkg/core.py
import os
import requests
import mypkg.gone.thing
from .missing import helper
```

## Expect

- silence      # nothing binds a file of the repository
- mypkg/core.py:1 answers absent outside
- mypkg/core.py:2 answers absent outside
- mypkg/core.py:3 answers absent unfollowed
- mypkg/core.py:4 answers absent unfollowed

## Why

`mypkg` is the project's own package, so `mypkg.gone.thing` is a module of the repository the readers could not find, not a dependency.
