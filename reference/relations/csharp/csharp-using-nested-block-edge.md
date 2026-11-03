---
id: csharp-using-nested-block-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §14.5.1 (the scope of a using directive extends over the namespace body that contains it, nested bodies included); §14.5.3 (the namespace a using namespace directive names is resolved as the target of a using alias is: in the body that holds it, nearest namespace first, no using directive of that body taking part); §7.8.1 (namespace and type names)"
---

## Rule

A plain using directive of an outer namespace block reaches the references of a block nested in it. The namespace it names is read where the directive stands, nearest namespace first: `using Core;` inside `namespace A` imports `A.Core` when the repository has a namespace `A.Core`, and the global `Core` only when nothing nearer has that name. So `Order` in block `A.B` binds `A.Core.Order`, never a global `Core.Order` beside it.

## Files

```csharp path=src/a/Use.cs
namespace A
{
    using Core;
    namespace B
    {
        class C { Order o; }
    }
}
```

```csharp path=src/near/Order.cs
namespace A.Core;
public class Order { }
```

```csharp path=src/far/Order.cs
namespace Core;
public class Order { }
```

## Expect

- src/a/Use.cs:6 -> node:near     # `using Core;` in block A names A.Core; the global Core.Order (node far) is never it

## Why

The namespace of a using directive was taken as written, from the global namespace, so a using inside a namespace block imported a global namespace of that name where C# imports the nearer one.
