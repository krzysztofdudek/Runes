---
id: csharp-tuple-type-argument-named-elements-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §8.3.11 (tuple types — a tuple element is a type with an optional name); §6.2.5 (grammar ambiguities — a type-argument-list followed by `(`); §12.17 (a declaration expression is never a plain tuple element, so `(T a, U b)` after `<` can only be a tuple type)"
---

## Rule

A tuple type with named elements used as a type argument names each element's type: `new List<(Order Item, int Index)> { … }`, `new List<(Customer Who, DateTime At)>(n)`, `new Result<(Invoice Doc, int Count)>([])` and `Make<(Shipment Parcel, int Index)>(n)` depend on `Order`, `Customer`, `Invoice` and `Shipment`. The parser reads these forms (a named tuple followed by an initializer or by arguments) as comparisons around a tuple of declarations; a tuple of declarations is never a valid expression there, so it is read as the tuple type it is. Under `using Shop.Core;` each element type binds `Shop.Core.<Name>`.

## Files

```csharp path=src/app/Feed.cs
using System.Collections.Generic;
using Shop.Core;
class Feed {
  object Pending(int n) {
    var list = new List<(Order Item, int Index)>
    {
    };
    var sized = new List<(Customer Who, System.DateTime At)>(n);
    var wrapped = Wrap(new Result<(Invoice Doc, int Count)>([]));
    return Make<(Shipment Parcel, int Index)>(n);
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

## Expect

- src/app/Feed.cs:5 -> node:core      # new List<(Order Item, int Index)> { … }: the element type binds Shop.Core.Order
- src/app/Feed.cs:8 -> node:core      # new List<(Customer Who, …)>(n): binds Shop.Core.Customer
- src/app/Feed.cs:9 -> node:core      # new Result<(Invoice Doc, …)>([]): binds Shop.Core.Invoice
- src/app/Feed.cs:10 -> node:core     # Make<(Shipment Parcel, …)>(n): a generic method's tuple type argument binds Shop.Core.Shipment

## Why

A list of named tuples built with an initializer or a capacity is a common C# idiom, and the element type is often the only place the line names the other project's type (jellyfin's `new List<(BaseItemDto ItemDto, …)>`). The element names stay names (csharp-tuple-type-argument-element-names-silence).
