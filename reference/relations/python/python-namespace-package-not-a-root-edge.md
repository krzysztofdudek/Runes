---
id: python-namespace-package-not-a-root-edge
language: python
category: trap
expectation: edge
cites: "PEP 420 — Implicit Namespace Packages; Python sys.path initialization (the script's directory or the current directory, then the standard library, then site-packages); googleapis/google-cloud-python packages/google-cloud-logging and python-poetry/poetry src/poetry (issue 009)"
---

## Rule

A directory with no `__init__.py` whose parent has none either is a PEP 420 namespace package, and it lies inside the project rather than on `sys.path`: the installed project puts its source root there (here the repository root, which holds the `pyproject.toml`), and running a script puts only the script's own directory there. So `import logging` and `import logging.handlers` in `acme/core/service.py` load the standard library, and `import yaml` loads the installed library, even though the namespace package `acme/` has sub-packages `acme/logging/` and `acme/yaml/`. The resolver never probes an ancestor directory that lies strictly below a discovered project root, except the importing file's own directory, so none of the three imports binds to the namespace package's sub-packages. The genuine dependency, `from acme.core import LEVEL` in `acme/logging/__init__.py`, still resolves through the project root.

## Files

```toml path=pyproject.toml
[project]
name = "acme-tools"
version = "0"
```

```python path=acme/core/__init__.py
LEVEL = "INFO"
```

```python path=acme/core/service.py
import logging
import logging.handlers
import yaml

log = logging.getLogger(__name__)
```

```python path=acme/logging/__init__.py
from acme.core import LEVEL


def configure():
    return LEVEL
```

```python path=acme/yaml/__init__.py
def dump(data):
    return str(data)
```

## Expect

- acme/logging/__init__.py:1 -> node:core      # the genuine dependency: acme.core resolves through the project root
- # nothing from acme/core/service.py: `logging`, `logging.handlers` and `yaml` are the standard library and an installed library, never acme/logging/ or acme/yaml/

## Why

Every google-cloud-* library keeps a sub-package named like a standard-library module (`google/cloud/logging/` beside `google/cloud/logging_v2/`) under a namespace package, and poetry keeps `src/poetry/json/` under the namespace package `src/poetry/`. Probing the namespace directory as a root turned every `import logging` or `import json` there into a false, unsuppressible dependency, and where the real dependency runs the other way, declaring the false one creates a structural cycle.
