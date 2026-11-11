---
id: csharp-query-range-variable-type-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.20.3.2 (a from clause with an explicit range variable type: `from T x in e` is `e.Cast<T>()`), §12.20.3.6 (a join clause with an explicit type)"
---

## Rule

`from Row r in xs` names `Row`, and `join Cell c in ys` names `Cell`.

## Files

```csharp path=src/models/Models.cs
namespace App.Models;
public class Row { }
public class Cell { }
```

```csharp path=src/web/Q.cs
using App.Models;
namespace App.Web;
public class Q {
  object M(System.Collections.IEnumerable xs, System.Collections.IEnumerable ys) =>
    from Row r in xs
    join Cell c in ys on r equals c
    select r;
}
```

## Expect

- src/web/Q.cs:5 -> node:models      # `from Row r in xs`
- src/web/Q.cs:6 -> node:models      # `join Cell c in ys`

## Why

An explicit range variable type is a cast of the source, so the type is a dependency.
