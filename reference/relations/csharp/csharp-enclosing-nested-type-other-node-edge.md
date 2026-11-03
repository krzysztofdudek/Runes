---
id: csharp-enclosing-nested-type-other-node-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (the nested types of the enclosing type, from every part of a partial type, come before any namespace member); §15.2.7 (partial declarations)"
---

## Rule

A control: the part of `partial class Importer` that nests `Row` lies in node model, and the part that uses the bare `Row` in node etl. `Row` names `Importer.Row`, so the edge goes to node model, never to the global `Row` of node grid.

## Files

```csharp path=src/model/Importer.cs
namespace App.Etl;
public partial class Importer { public class Row { } }
```

```csharp path=src/etl/Importer.Run.cs
namespace App.Etl;
public partial class Importer {
  public void Run(Row r) { }
}
```

```csharp path=src/grid/Row.cs
public class Row { }
```

## Expect

- src/etl/Importer.Run.cs:3 -> node:model      # Importer+Row, declared by the other part

## Why

The nested reading binds like any other reading: its declaring file gives the edge, here a part in another node.
