---
id: csharp-ref-local-type-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §13.6.2 (a ref local declares its type: `ref T x = ref …`)"
---

## Rule

A ref local's type names `Line`.

## Files

```csharp path=src/models/Line.cs
namespace App.Models;
public class Line { }
```

```csharp path=src/web/Store.cs
using App.Models;
namespace App.Web;
public class Store {
  void M(object[] a) { ref Line l = ref Get(); }
}
```

## Expect

- src/web/Store.cs:4 -> node:models      # `ref Line l`

## Why

`ref` wraps the type; the type inside is the dependency.
