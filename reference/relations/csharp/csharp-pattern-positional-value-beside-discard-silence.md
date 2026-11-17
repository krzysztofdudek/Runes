---
id: csharp-pattern-positional-value-beside-discard-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §11.2.5 (positional pattern), §11.2.3 (constant pattern), §12.8.4 (simple names: a member of the enclosing type is found before a type a using imports)"
---

## Rule

`x is (Order, _)` inside a class that declares `const int Order = 1` tests the constant: the simple name `Order` finds the class's own member before the type `App.Models.Order` the using directive imports, so the subpattern is a constant pattern and the test gives no edge to the type.

## Files

```csharp path=src/c/Use.cs
using App.Models;
namespace App;
class C {
  const int Order = 1;
  bool A(object x) => x is (Order, _);
}
```

```csharp path=src/order/Order.cs
namespace App.Models;
public class Order {}
```

## Expect

- silence      # Order is the constant of class C, not the type of node order

## Why

Reading every simple name in a positional pattern as a type would give a false edge to a type spelled like a constant the file declares.
