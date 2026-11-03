---
id: csharp-using-sibling-block-silence
language: csharp
category: nested
expectation: silence
cites: "C# spec §14.5.1 (the scope of a using directive extends over the namespace member declarations of the compilation unit or namespace body that immediately contains it, and not over another body); §14.5.3 (using namespace directives)"
---

## Rule

A plain using directive inside a namespace block imports its namespace for that block's body only. A sibling block of the same file does not see it, so a reference in the second block cannot bind a type that only the first block's using brings into scope.

## Files

```csharp path=src/a/Use.cs
namespace App.First
{
    using Shop.Core;
    class A { }
}
namespace App.Second
{
    class B { Order o; }
}
```

```csharp path=src/core/Order.cs
namespace Shop.Core;
public class Order { }
```

## Expect

- silence      # `Order` in block App.Second is not Shop.Core.Order: the using sits in block App.First

## Why

Plain using directives were read file-wide, so a using in one namespace block reached a reference in a sibling block and gave an edge to a type that block cannot name, a false edge that can force a cycle a team cannot remove.
