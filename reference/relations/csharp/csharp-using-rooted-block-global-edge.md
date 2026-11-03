---
id: csharp-using-rooted-block-global-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §14.5.3 (using namespace directives); §14.8.1 (a qualified alias member `global::N` names `N` from the global namespace, whatever is nearer)"
---

## Rule

A using directive written `using global::Core;` names the global namespace `Core`, whatever namespace the block around it is in. Inside `namespace A`, with a namespace `A.Core` declared beside a global `Core`, it imports the global `Core` and never `A.Core`. A reference in the block and the target of an alias in a nested block both read it that way.

## Files

```csharp path=src/a/Use.cs
namespace A
{
    using global::Core;
    class C { Order o; }
}
```

```csharp path=src/b/Use.cs
namespace A
{
    using global::Core;
    namespace B
    {
        using O = Order;
        class D { O o; }
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

- src/a/Use.cs:4 -> node:far      # `using global::Core;` imports the global Core; A.Core.Order (node near) is never it
- src/b/Use.cs:6 -> node:far      # the directive of O reads Order through the outer rooted using
- src/b/Use.cs:7 -> node:far      # the use of O the same way

## Why

A rooted using inside a namespace block was read as if it were written without `global::`, so the nearer namespace `A.Core` was imported and the reference bound a type the code never names.
