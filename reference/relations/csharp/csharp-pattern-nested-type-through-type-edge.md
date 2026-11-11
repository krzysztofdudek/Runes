---
id: csharp-pattern-nested-type-through-type-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.8.1; §11.2.5 (type pattern), §12.8.7 (member access through a type: a nested type)"
---

## Rule

`o is Outer.Inner` names a type nested in `Outer`; the edge goes to the node that declares `Outer`.

## Files

```csharp path=src/core/Outer.cs
namespace App.Core;
public class Outer { public class Inner { } }
```

```csharp path=src/web/Check.cs
using App.Core;
namespace App.Web;
public class Check {
  public bool A(object o) => o is Outer.Inner;
}
```

## Expect

- src/web/Check.cs:4 -> node:core      # Outer.Inner is a nested type of node core

## Why

A guard for the dotted reading: a nested type is still named through its enclosing type.
