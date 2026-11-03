---
id: csharp-alias-target-outer-alias-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §14.5.2 (a using alias target is resolved with the using aliases of an enclosing namespace declaration taking part); §7.8.1 (at a namespace whose declaration holds an alias of the name, that alias decides)"
---

## Rule

When an enclosing namespace block declares a using alias named like the first name of an inner alias target, that alias decides at its level, and it is read where its own directive reads its target. In `namespace A { using X = Shop.Core; namespace B { using P = X.Order; } }` the target of `P` is `Shop.Core.Order`, never a global `X.Order` beside it.

## Files

```csharp path=src/d/Use.cs
namespace A
{
    using X = Shop.Core;
    namespace B
    {
        using P = X.Order;
        class D { P p; }
    }
}
```

```csharp path=src/core/Order.cs
namespace Shop.Core;
public class Order { }
```

```csharp path=src/x/Order.cs
namespace X;
public class Order { }
```

## Expect

- src/d/Use.cs:6 -> node:core     # the directive of P reads its target the same way
- src/d/Use.cs:7 -> node:core     # the use of P binds Shop.Core.Order through the alias X of block A; the global X.Order (node x) is never it

## Why

An alias of an enclosing block named like the target's first name ended the lookup without being read, so a real edge was lost.
