---
id: csharp-nested-tuple-type-argument-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §8.3.11 (tuple types — an element name is a field name, not a type); §12.11 (shift operators); Runes issue 174"
---

## Rule

One generic level deeper, the element NAMES of a tuple type argument are still field names: `new List<List<(int Order, string Customer)>>(n)` and `Make<List<(long Invoice, int I)>>(n)` depend on none of the types `Order`, `Customer`, `Invoice` or `Make` that `Shop.Core` declares. A real shift of a plain tuple, `i < (Order, Customer) >> 1` where `Order` and `Customer` are locals, names no type either.

## Files

```csharp path=src/app/Feed.cs
using System.Collections.Generic;
using Shop.Core;
class Feed {
  object Pending(int n, int i, int Order, int Customer) {
    var lists = new List<List<(int Order, string Customer)>>(n);
    var made = Make<List<(long Invoice, int I)>>(n);
    return i < (Order, Customer) >> 1;
  }
}
```

```csharp path=src/core/Types.cs
namespace Shop.Core;
public class Order {}
public class Customer {}
public class Invoice {}
public class Make {}
```

## Expect

- silence      # every name above is a tuple element name, a method name or a local, never a type

## Why

Element names are routinely named after the domain type they hold; reading them as types, or the generic method's name as a type, invents a dependency.
