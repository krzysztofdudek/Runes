---
id: csharp-ref-and-query-types-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §15.6.1 (ref returns), §13.6.2 (ref locals), §12.20.3.2 (a from clause with an explicit range variable type)"
---

## Rule

Each line names a type of node models in a type position: a ref return, a ref readonly return, a ref local and the explicit type of a query range variable.

## Files

```csharp path=src/models/Models.cs
namespace App.Models;
public class Order { }
public class Item { }
public class Line { }
public class Row { }
```

```csharp path=src/web/Store.cs
using App.Models;
namespace App.Web;
public class Store {
  public ref Order First() => throw null;
  public ref readonly Item Second() => throw null;
  void M() { ref Line l = ref Get(); }
  object Q(System.Collections.IEnumerable xs) => from Row r in xs select r;
}
```

## Expect

- src/web/Store.cs:4 -> node:models      # `ref Order`
- src/web/Store.cs:5 -> node:models      # `ref readonly Item`
- src/web/Store.cs:6 -> node:models      # `ref Line l`
- src/web/Store.cs:7 -> node:models      # `from Row r in xs`

## Why

Four type positions the reading of a type did not reach.
