---
id: csharp-alias-colon-colon-generic-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §13.8 (qualified alias member `::`); §14.5 (using_alias_directive to a namespace)"
---

## Rule

In `S::Gen<int>`, the left of `::` is resolved only as an alias. When `S` is an in-file using alias to a namespace (`using S = Shop.Core;`), the generic tail `Gen<int>` names the generic type `Shop.Core.Gen<T>`, the same as the tail `Gen` does without its type arguments. The type arguments are references of their own, so `S::Gen<Order>` also binds `Order`.

## Files

```csharp path=src/app/Use.cs
using S = Shop.Core;
class F {
  S::Gen<int> g = null;
  S::Gen<S::Order> h = null;
}
```

```csharp path=src/gen/Gen.cs
namespace Shop.Core;
public class Gen<T> {}
```

```csharp path=src/order/Order.cs
namespace Shop.Core;
public class Order {}
```

## Expect

- src/app/Use.cs:3 -> node:gen      # `S::Gen<int>` binds Shop.Core.Gen<T>
- src/app/Use.cs:4 -> node:gen      # `S::Gen<S::Order>` binds the generic type
- src/app/Use.cs:4 -> node:order    # and its type argument S::Order, rewritten to Shop.Core.Order

## Why

A generic type named through a namespace alias is the usual way a file that uses several namespaces keeps its names short; the alias-qualified generic is dropped today.
