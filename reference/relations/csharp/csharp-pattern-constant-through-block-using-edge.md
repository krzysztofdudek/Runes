---
id: csharp-pattern-constant-through-block-using-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §14.5.3 (using directives of a namespace body), §7.8.1; §11.2.3 (constant pattern), §11.2.7-§11.2.9 (negated and disjunctive patterns)"
---

## Rule

The enum `Status` comes through a using directive inside the namespace block, which is read before the global namespace. `s is Status.Active`, `not Kind.A` and `Kind.A or Kind.A` name its members, so the edge goes to node enums only; a global namespace `Status` holding a class `Active` (node other) is never reached.

## Files

```csharp path=src/enums/Status.cs
namespace App.Enums;
public enum Status { Active, Closed }
public enum Kind { A, B }
```

```csharp path=src/other/Shadow.cs
namespace Status { public class Active { } }
namespace Kind { public class A { } }
```

```csharp path=src/web/Check.cs
namespace App.Web {
  using App.Enums;
  public class Check {
    public bool A(Status s) => s is Status.Active;
    public bool B(Kind k) => k is not Kind.A;
    public bool C(Kind k) => k is Kind.A or Kind.A;
  }
}
```

## Expect

- src/web/Check.cs:4 -> node:enums      # `s is Status.Active`
- src/web/Check.cs:5 -> node:enums      # `k is not Kind.A`
- src/web/Check.cs:6 -> node:enums      # `k is Kind.A or Kind.A`

## Why

The first name binds through the using directive of the block, a type, so the lookup ends there.
