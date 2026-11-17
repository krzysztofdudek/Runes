---
id: python-relative-member-of-module-edge
language: python
category: import
expectation: edge
cites: "Python language reference, the import statement: `from M import x` imports M, then takes x from it as an attribute, and only when that fails as the submodule M.x; PEP 328 relative imports"
---

## Rule

`from ..data.m import x` imports the module `..data.m` and takes `x` from it. The extractor writes the module (`..data.m`) and the module with the name (`..data.m.x`), since the name may be a submodule; when it is not, the use of the name binds the module's file, `data/m.py`, as `from pkg.data.m import x` binds it. `from ..data import x` binds the package's `data/__init__.py` the same way. A relative module that binds no file stays unfollowed.

## Files

```python path=src/pkg/__init__.py
```

```python path=src/pkg/data/__init__.py
y = 2
```

```python path=src/pkg/data/m.py
x = 1
```

```python path=src/pkg/ui/__init__.py
```

```python path=src/pkg/ui/a.py
from ..data.m import x
from ..data import y
from pkg.data.m import x as x2
from pkg.data import y as y2
from ..gone import z
```

## Expect

- src/pkg/ui/a.py:1 -> node:data      # ..data.m and ..data.m.x both bind src/pkg/data/m.py
- src/pkg/ui/a.py:2 -> node:data
- src/pkg/ui/a.py:3 -> node:data
- src/pkg/ui/a.py:4 -> node:data
- src/pkg/ui/a.py:1 answers resolved src/pkg/data/m.py
- src/pkg/ui/a.py:2 answers resolved src/pkg/data/__init__.py
- src/pkg/ui/a.py:3 answers resolved src/pkg/data/m.py
- src/pkg/ui/a.py:4 answers resolved src/pkg/data/__init__.py
- src/pkg/ui/a.py:5 answers absent unfollowed

## Why

Before, the relative name bound nothing and was answered unfollowed, though its module was in the repository: the same file was resolved when the import was written absolute and unfollowed when it was written relative, so a consumer counting unfollowed uses counted thousands of relative imports that were no gap.
