---
id: csharp-pattern-enum-member-through-type-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §11.2.3 (constant pattern), §12.8.7 (member access through a type)"
---

## Rule

`s is Status.Active` names an enum member through its type: the edge goes to `Status` (node enums). A class `Active` of another namespace, which `using` makes visible, is never named by the member.

## Files

```csharp path=src/enums/Status.cs
namespace App.Enums;
public enum Status { Active, Closed }
```

```csharp path=src/other/Active.cs
namespace App.Other;
public class Active { }
```

```csharp path=src/web/Check.cs
using App.Enums;
using App.Other;
namespace App.Web;
public class Check {
  public bool A(Status s) => s is Status.Active;
}
```

## Expect

- src/web/Check.cs:5 -> node:enums      # Status; never node other, whose class Active the member does not name

## Why

A dotted name in a pattern may be a type or a member of a type; reading it as the type `Status.Active` must give an edge only to a type that exists with that qualified name.
