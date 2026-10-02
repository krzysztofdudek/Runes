---
id: csharp-tuple-type-argument-element-names-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §8.3.11 (tuple types — an element name is an identifier naming a field of the tuple, not a type)"
---

## Rule

The element NAMES of a tuple type argument are field names, never types: in `new List<(int Order, string Customer)> { … }`, `new List<(int Invoice, bool Shipment)>(n)` and `Make<(long Order, int Customer)>(n)` nothing depends on the types `Order`, `Customer`, `Invoice` or `Shipment`, even when an imported namespace declares them. Only the element types are read, and here they are all predefined.

## Files

```csharp path=src/app/Feed.cs
using System.Collections.Generic;
using Shop.Core;
class Feed {
  object Pending(int n) {
    var list = new List<(int Order, string Customer)>
    {
    };
    var sized = new List<(int Invoice, bool Shipment)>(n);
    return Make<(long Order, int Customer)>(n);
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

- silence      # every name above is a tuple element name, not a type

## Why

Element names are routinely named after the domain type they hold the value of; reading them as types would invent a dependency for every such tuple.
