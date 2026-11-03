---
id: csharp-alias-qualified-target-directive-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §14.5.2 (a using alias target is resolved in the namespace body that holds the directive, nearest namespace first); §7.8.1 (at each namespace a member namespace or type of the first name decides, and lookup stops there)"
---

## Rule

The target of a using alias inside a namespace body is read namespace by namespace, nearest first, and the first namespace with a member named like the target's first segment decides. When the repository declares no such nearer namespace or type, the fully qualified target names the global type, and its directive gives the edge whether or not the alias is used. When the repository does declare one (`App.Web.Shop` here), C# stops there and the directive gives no edge to the global type.

## Files

```csharp path=src/t/Test.cs
namespace App.Tests;
using O = Shop.Ordering.Order;
class T { }
```

```csharp path=src/n/Use.cs
namespace App.Web
{
    using O = Shop.Ordering.Order;
    class W { }
}
```

```csharp path=src/near/Thing.cs
namespace App.Web.Shop;
public class Thing { }
```

```csharp path=src/order/Order.cs
namespace Shop.Ordering;
public class Order { }
```

## Expect

- src/t/Test.cs:2 -> node:order     # no namespace App.Tests.Shop or App.Shop: the target is the global Shop.Ordering.Order
                                    # src/n/Use.cs gives no edge: `Shop` there is the namespace App.Web.Shop, which has no Ordering.Order

## Why

The directive line of a plain alias target inside a namespace body read only its nearest namespace, so an unused alias to a fully qualified type lost its edge although nothing nearer has that name.
