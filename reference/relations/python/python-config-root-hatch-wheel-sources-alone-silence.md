---
id: python-config-root-hatch-wheel-sources-alone-silence
language: python
category: import
expectation: silence
cites: "Hatch, Build configuration: an option a target sets overrides the same option of `[tool.hatch.build]`; hatchling's `BuilderConfig.sources` reads the wheel target's `sources` alone whenever the target sets them"
---

## Rule

A project whose `[tool.hatch.build]` writes `sources = ["lib"]` and whose wheel target writes `sources = ["src"]` builds its wheel from `src/` alone: the target's option replaces the build-wide one. `lib/` is then no root, and `import yaml` in the package is the installed library, not a module that happens to sit in `lib/`.

## Files

```toml path=pyproject.toml
[project]
name = "pkg"
version = "0.1.0"

[tool.hatch.build]
sources = ["lib"]

[tool.hatch.build.targets.wheel]
sources = ["src"]
```

```python path=lib/yaml.py
def load():
    pass
```

```python path=src/pkg/__init__.py
```

```python path=src/pkg/x.py
import yaml
```

## Expect

- silence
- src/pkg/x.py:1 answers absent outside      # the wheel's sources alone name the root: src/, not lib/

## Why

Joining the two options made `lib/` a root beside `src/`, so a stray `lib/yaml.py` captured the import of the installed library: a false edge.
