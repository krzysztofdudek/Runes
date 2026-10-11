---
id: csharp-tuple-unnamed-global-generic-element-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §8.3.11 (tuple types — a tuple element is a type with an optional name, so an unnamed element beside a named one is a type); §7.8 (global:: alias-qualified name); §8.4.2 (constructed types)"
---

## Rule

An unnamed tuple element beside a named one is a type however it is spelled: written with `global::` (`global::Shop.Core.Customer`), as a qualified generic (`Shop.Core.Repo<Order>`) or as a bare generic (`Repo<Order>`), it names its type exactly as a plain `Shop.Core.Customer` does. The `global::` element is looked up from the root, the generic one by its plain dotted name (declaration keys carry no arity), and the type arguments of a generic element are references of their own.

## Files

```csharp path=src/app/Feed.cs
using System.Collections.Generic;
using Shop.Core;
class Feed {
  object Rooted(int n) => new List<(int I, global::Shop.Core.Customer)>(n);
  object Qualified(int n) => new List<(int I, Shop.Core.Repo<Shop.Core.Order>)>(n);
  object Bare(int n) => new List<(int I, Repo<Shop.Core.Invoice>)>(n);
}
```

```csharp path=src/cust/Customer.cs
namespace Shop.Core;
public class Customer {}
```

```csharp path=src/repo/Repo.cs
namespace Shop.Core;
public class Repo<T> {}
```

```csharp path=src/order/Order.cs
namespace Shop.Core;
public class Order {}
```

```csharp path=src/invoice/Invoice.cs
namespace Shop.Core;
public class Invoice {}
```

## Expect

- src/app/Feed.cs:4 -> node:cust      # the `global::` element binds Shop.Core.Customer from the root
- src/app/Feed.cs:5 -> node:repo      # the qualified generic element binds Shop.Core.Repo
- src/app/Feed.cs:5 -> node:order     # and its type argument
- src/app/Feed.cs:6 -> node:repo      # the bare generic element binds Repo through the using
- src/app/Feed.cs:6 -> node:invoice   # and its type argument

## Why

The unnamed element is the only place the line names these types, so a form that stays silent hides a real dependency; the plain qualified form is the case csharp-tuple-unnamed-qualified-element-edge.
