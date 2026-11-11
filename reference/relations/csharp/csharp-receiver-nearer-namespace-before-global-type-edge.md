---
id: csharp-receiver-nearer-namespace-before-global-type-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §7.8.1 (namespace and type names: the first name is looked up at each enclosing namespace, innermost first, and the first namespace or type found is what it names); §12.8.7 (member access through a namespace)"
---

## Rule

The first name of a dotted receiver is bound first, at each enclosing namespace from the innermost outward, and what is found first decides: a namespace as much as a type. In `namespace App.Web`, `Data` names the namespace `App.Data`, which lies nearer than a class `Data` of the global namespace, so `Data.Row.Parse()` and `o is Data.Row` name `App.Data.Row`, as the type `Data.Row` of a field does.

## Files

```csharp path=src/legacy/Data.cs
public static class Data {
  public static class Row { public static void Parse() { } }
}
```

```csharp path=src/data/Row.cs
namespace App.Data;
public class Row {
  public static void Parse() { }
}
```

```csharp path=src/web/Page.cs
namespace App.Web;
public class Page {
  Data.Row _row;
  public void Render(object o) {
    Data.Row.Parse();
    if (o is Data.Row) { }
  }
}
```

## Expect

- src/web/Page.cs:3 -> node:data      # the type reading: App.Data.Row
- src/web/Page.cs:5 -> node:data      # the receiver: Data is the namespace App.Data
- src/web/Page.cs:6 -> node:data      # the pattern: the same name

## Why

A receiver's readings were ordered by prefix, every reading of `Data` before any of `Data.Row`, so the class `Data` of the global namespace took the edge before the nearer namespace was read.
