---
id: python-pkgutil-namespace-across-distributions-edge
language: python
category: import
expectation: edge
cites: "PyPA packaging guide — pkgutil-style namespace packages (`__path__ = __import__('pkgutil').extend_path(__path__, __name__)`); apache/airflow, whose airflow-core, task-sdk and provider distributions all ship `src/airflow/__init__.py` (issue 073)"
---

## Rule

In a uv workspace whose members share a pkgutil-style namespace package, every member ships its own `acme/__init__.py`, and each one extends `acme.__path__` across all installed members. `from acme import settings` and `import acme.settings` therefore load the one `acme/settings/` there is, in the core member, whichever member imports it and whatever the `sys.path` order. The resolver first looks for the exact module or package at every source root; only when no root has one does it fall back to the parent package (the case where `settings` is a name defined in `acme/__init__.py`). So the plugin member's `acme/__init__.py` does not make `acme.settings` ambiguous, and both members' imports reach `core/src/acme/settings/`. The bare `acme` stays silent: two distributions really do hold an `acme/__init__.py`.

## Files

```toml path=pyproject.toml
[tool.uv.workspace]
members = ["core", "plugin"]
```

```toml path=core/pyproject.toml
[project]
name = "acme-core"
version = "0.1.0"
```

```python path=core/src/acme/__init__.py
__path__ = __import__("pkgutil").extend_path(__path__, __name__)
```

```python path=core/src/acme/settings/__init__.py
DEBUG = False
```

```python path=core/src/acme/models/user.py
from acme import settings
import acme.settings


def debug():
    return settings.DEBUG
```

```toml path=plugin/pyproject.toml
[project]
name = "acme-plugin"
version = "0.1.0"
dependencies = ["acme-core"]
```

```python path=plugin/src/acme/__init__.py
__path__ = __import__("pkgutil").extend_path(__path__, __name__)
```

```python path=plugin/src/acme/hooks/run.py
from acme import settings
```

## Expect

- core/src/acme/models/user.py:1 -> node:settings      # `acme.settings` is exactly core/src/acme/settings/; plugin/src/acme/__init__.py is only the parent-package fallback
- core/src/acme/models/user.py:2 -> node:settings      # the plain `import acme.settings` form, same module
- plugin/src/acme/hooks/run.py:1 -> node:settings      # from the other distribution, through the extended `acme.__path__`

## Why

Apache Airflow splits one `airflow` package across its core, its task SDK and every provider, each shipping `src/airflow/__init__.py`. Counting a sibling distribution's `__init__.py` as an equal match turned every `from airflow import settings` into silence, so the dependency of the task SDK on airflow-core's settings, a boundary Airflow lints itself, was invisible.
