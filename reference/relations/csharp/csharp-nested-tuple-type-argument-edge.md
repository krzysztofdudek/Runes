---
id: csharp-nested-tuple-type-argument-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §8.3.11 (tuple types); §6.2.5 (grammar ambiguities — `>>` closing two type argument lists); §12.17 (a declaration expression is never an operand); Runes issue 174"
---

## Rule

A tuple type with named elements one generic level deeper names its element types too: `new List<List<(Order Item, int Index)>>(n)`, `new List<Page<(Customer Who, int I)>> { … }`, `Make<List<(Invoice Doc, int I)>>(n)` and `new Box<Page<List<(Shipment Parcel, int I)>>>(n)` depend on `Order`, `Customer`, `Invoice` and `Shipment`, and an enclosing generic such as `Page` is a type reference as well, at any depth. The parser reads the closing `>>` or `>>>` as a shift around a tuple of declarations, which is never a valid operand, so it is read as the tuple type it is. The method name `Make` stays a method name.

## Files

```csharp path=src/app/Feed.cs
using System.Collections.Generic;
using Shop.Core;
class Feed {
  object Pending(int n) {
    var lists = new List<List<(Order Item, int Index)>>(n);
    var pages = new List<Page<(Customer Who, int I)>>
    {
    };
    var made = Make<List<(Invoice Doc, int I)>>(n);
    return new Box<Page<List<(Shipment Parcel, int I)>>>(n);
  }
}
```

```csharp path=src/core/Types.cs
namespace Shop.Core;
public class Order {}
public class Customer {}
public class Invoice {}
public class Shipment {}
```

```csharp path=src/paging/Page.cs
namespace Shop.Core;
public class Page<T> {}
public class Make {}
```

```csharp path=src/boxing/Box.cs
namespace Shop.Core;
public class Box<T> {}
```

## Expect

- src/app/Feed.cs:5 -> node:core      # new List<List<(Order Item, …)>>(n): the element type binds Shop.Core.Order
- src/app/Feed.cs:6 -> node:core      # new List<Page<(Customer Who, …)>> { … }: binds Shop.Core.Customer
- src/app/Feed.cs:6 -> node:paging    # … and the enclosing generic Page binds Shop.Core.Page<T>
- src/app/Feed.cs:9 -> node:core      # Make<List<(Invoice Doc, …)>>(n): binds Shop.Core.Invoice; Make is the method, never the type Make (node:paging)
- src/app/Feed.cs:10 -> node:core     # new Box<Page<List<(Shipment Parcel, …)>>>(n): binds Shop.Core.Shipment
- src/app/Feed.cs:10 -> node:boxing   # … the created type Box binds Shop.Core.Box<T>
- src/app/Feed.cs:10 -> node:paging   # … and Page, two levels in behind `>>>`, binds Shop.Core.Page<T>

## Why

A list of lists of named tuples is how grouped results are often built; the element type is the only place the line names the other project's type, and one level of nesting must not hide it.
