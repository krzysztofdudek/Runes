---
id: csharp-tuple-unnamed-qualified-element-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §8.3.11 (tuple types — a tuple element is a type with an optional name, so an unnamed element beside a named one is a type); §6.2.5 (grammar ambiguities — a type-argument-list followed by `(`)"
---

## Rule

An unnamed tuple element is a type, named by its own text, even when the tuple also has named elements: in `new List<(Order O, Shop.Core.Customer)>(n)` the element `Shop.Core.Customer` names a type exactly as `Order` does, and both bind their declarations. The grammar reads this tuple as a comparison around a tuple of declarations, so the unnamed element arrives as a member access, which is read as the dotted type name it spells.

## Files

```csharp path=src/app/Feed.cs
using System.Collections.Generic;
using Shop.Core;
class Feed {
  object Pending(int n) {
    var pairs = new List<(Order O, Shop.Core.Customer)>(n);
    return pairs;
  }
}
```

```csharp path=src/order/Order.cs
namespace Shop.Core;
public class Order {}
```

```csharp path=src/cust/Customer.cs
namespace Shop.Core;
public class Customer {}
```

## Expect

- src/app/Feed.cs:5 -> node:order     # the named element's type Order
- src/app/Feed.cs:5 -> node:cust      # the unnamed element Shop.Core.Customer, written qualified, binds Shop.Core.Customer

## Why

A tuple that mixes a named element with a qualified unnamed one is a plain list of pairs; the qualified element is the only place the line names the other project's type, so dropping it hides a real dependency.
