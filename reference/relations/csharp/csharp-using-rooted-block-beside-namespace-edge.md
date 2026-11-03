---
id: csharp-using-rooted-block-beside-namespace-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §14.5.3 (using namespace directives); §14.8.1 (a qualified alias member `global::N` names `N` from the global namespace, whatever is nearer)"
---

## Rule

A nearer namespace of the same name does not hide a namespace named after `global::`. Inside `namespace A`, `using global::Core;` imports the global `Core` even when the repository declares a namespace `A.Core`, so `Order` binds the global `Core.Order` although `A.Core` holds other types.

## Files

```csharp path=src/a/Use.cs
namespace A
{
    using global::Core;
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

- src/a/Use.cs:4 -> node:far      # the global Core.Order; the namespace A.Core does not hide it

## Why

A rooted using read like a plain one lost its edge whenever a nearer namespace of that name existed.
