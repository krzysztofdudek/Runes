---
id: csharp-using-block-namespace-shadow-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §14.5.3 (the namespace a using namespace directive names is resolved in the body that holds it, nearest namespace first); §7.8.1 (at each namespace a member namespace of that name decides, and lookup stops there)"
---

## Rule

The namespace a using directive inside a namespace block names is the nearest one of that name. When the repository declares a namespace `A.Core`, `using Core;` inside `namespace A` imports `A.Core` and nothing else, even when `A.Core` holds no `Order` and a global namespace `Core` does. A reference to `Order` there never binds the global `Core.Order`.

## Files

```csharp path=src/a/Use.cs
namespace A
{
    using Core;
    class C { Order o; }
}
```

```csharp path=src/near/Other.cs
namespace A.Core;
public class Other { }
```

```csharp path=src/far/Order.cs
namespace Core;
public class Order { }
```

## Expect

- silence      # `using Core;` names A.Core, which has no Order; the global Core.Order (node far) is not imported

## Why

Reading the namespace of a using directive as written would import the global `Core` here and give an edge to a type the code never names.
