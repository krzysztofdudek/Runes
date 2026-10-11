---
id: csharp-alias-colon-colon-qualified-tail-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §13.8 (qualified alias member `::`); §7.8.1 (the left of `::` is an alias or an extern alias, never a type)"
---

## Rule

In `S::Core.Order` and `T::B.Foo`, the left of `::` is an in-file using alias to a namespace, and the dotted tail that follows names a type under that namespace: `S` binds `Shop`, so `S::Core.Order` is `Shop.Core.Order`, and `T` binds `A`, so `T::B.Foo` is `A.B.Foo`. The alias rewrites only its leftmost segment, and the tail is resolved from the root.

## Files

```csharp path=src/app/Use.cs
using S = Shop;
using T = A;
class F {
  S::Core.Order o = null;
  T::B.Foo f = null;
}
```

```csharp path=src/order/Order.cs
namespace Shop.Core;
public class Order {}
```

```csharp path=src/ab/Foo.cs
namespace A.B;
public class Foo {}
```

## Expect

- src/app/Use.cs:4 -> node:order    # S::Core.Order rewrites S to Shop and binds Shop.Core.Order
- src/app/Use.cs:5 -> node:ab       # T::B.Foo rewrites T to A and binds A.B.Foo

## Why

A qualified name under a namespace alias is a type reference like any other; the alias-qualified form of a qualified name is dropped today, so the dependency only shows when the full namespace is written out.
