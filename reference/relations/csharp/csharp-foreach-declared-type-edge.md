---
id: csharp-foreach-declared-type-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §13.9.5 (the foreach statement — an explicitly typed iteration variable)"
---

## Rule

An explicitly typed iteration variable `foreach (Order o in rows)` names its type, a real type reference (the compiler converts each element to it). Under `using Shop.Core;` the bare type binds `Shop.Core.Order`. `foreach (var o in rows)` names no type.

## Files

```csharp path=src/app/Report.cs
using Shop.Core;
class Report {
  int Count(System.Collections.IEnumerable rows) {
    int n = 0;
    foreach (Order o in rows) n++;
    foreach (var x in rows) n++;
    return n;
  }
}
```

```csharp path=src/core/Order.cs
namespace Shop.Core;
public class Order {}
```

## Expect

- src/app/Report.cs:5 -> node:core      # foreach (Order o in rows): the iteration type binds Shop.Core.Order

## Why

Iterating a non-generic or object-typed collection as another node's type is a dependency the loop header alone carries.
