---
id: csharp-enclosing-nested-type-other-part-silence
language: csharp
category: nested
expectation: silence
cites: "C# spec §7.6.1 (the nested types of the enclosing type, from every part of a partial type, come before any namespace member); §15.2.7 (partial declarations)"
---

## Rule

One part of `partial class Importer` nests `Row`; the other part, in another file, uses the bare `Row`, which is `Importer.Row`, never the global `Row` of node grid.

## Files

```csharp path=src/etl/Importer.cs
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

- silence      # Row binds Importer+Row, declared by the other part in node etl

## Why

The nested reading is a declaration key (`App.Etl.Importer+Row`), so it finds the nested type whichever part declares it.
