---
id: csharp-array-creation-element-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec — array creation expressions; §17 (arrays)"
---

## Rule

An array creation `new Order[4]` names its element type, a real type reference, the same as `new Order()`. Jagged and multi-dimensional forms (`new Order[2][]`, `new Order[2, 3]`) name it too. Under `using Shop.Core;` the bare element type binds `Shop.Core.Order`.

## Files

```csharp path=src/app/Batch.cs
using Shop.Core;
class Batch {
  object Make() {
    return new Order[4];
  }
  object Grid() {
    return new Order[2, 3];
  }
}
```

```csharp path=src/core/Order.cs
namespace Shop.Core;
public class Order {}
```

## Expect

- src/app/Batch.cs:4 -> node:core      # new Order[4]: the element type binds Shop.Core.Order
- src/app/Batch.cs:7 -> node:core      # new Order[2, 3]: the element type of a multi-dimensional array

## Why

An array of another node's type is a dependency on that type; a `var` local holding it names the type nowhere else.
