---
id: csharp-alias-target-outer-using-namespace-read-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §14.5.2 (a using alias target is resolved as if its own body had no using directives, while those of an enclosing namespace declaration take part); §14.5.3 (the namespace a using namespace directive names is resolved where that directive stands, nearest namespace first)"
---

## Rule

When the target of a using alias is found through a using directive of an enclosing namespace block, the namespace that using imports is the one it names where it stands. In `namespace A { using Core; namespace B { using O = Order; } }`, with a namespace `A.Core` in the repository, `using Core;` imports `A.Core`, so `O` is `A.Core.Order`, never a global `Core.Order` beside it.

## Files

```csharp path=src/a/Use.cs
namespace A
{
    using Core;
    namespace B
    {
        using O = Order;
        class C { O o; }
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

- src/a/Use.cs:6 -> node:near     # the directive of O reads its target the same way
- src/a/Use.cs:7 -> node:near     # the use of O binds A.Core.Order; the global Core.Order (node far) is never it

## Why

The using directives of an enclosing block were read by their written text for an alias target, so the global namespace `Core` was imported where C# imports `A.Core`.
