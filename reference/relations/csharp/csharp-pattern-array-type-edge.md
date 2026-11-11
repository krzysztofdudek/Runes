---
id: csharp-pattern-array-type-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §11.2.5 (type pattern: an array type)"
---

## Rule

`o is Note[]` names the element type `Note`.

## Files

```csharp path=src/models/Note.cs
namespace App.Models;
public class Note { }
```

```csharp path=src/web/Check.cs
using App.Models;
namespace App.Web;
public class Check {
  public bool E(object o) => o is Note[];
}
```

## Expect

- src/web/Check.cs:4 -> node:models      # the element type of `is Note[]`

## Why

An array or nullable type after `is` is not a pattern; the grammar gives it as the right operand of the operator.
