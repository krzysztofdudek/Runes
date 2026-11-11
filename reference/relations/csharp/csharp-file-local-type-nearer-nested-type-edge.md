---
id: csharp-file-local-type-nearer-nested-type-edge
language: csharp
category: nested
expectation: edge
cites: "C# 11 file-local types proposal, Lookup (a file-local type shadows within the lookup level it is found at); C# spec §7.6.1 and §12.8.4 (the nested types of the enclosing types are read before any namespace member)"
---

## Rule

A file-local type is found among the types of its namespace, which come after the nested types of the types around a reference. A nested type of the enclosing type, here declared in another part of the partial class, is nearer and still binds; the file-local type does not shadow it.

## Files

```csharp path=src/web/Use.cs
namespace App;
file class Helper { }
partial class C {
  Helper h;
}
```

```csharp path=src/part/C.cs
namespace App;
partial class C {
  class Helper { }
}
```

## Expect

- src/web/Use.cs:4 -> node:part      # App.C+Helper, a nested type of the enclosing type, comes before the namespace's file-local Helper

## Why

The shadowing is confined to the level of the file-local type: a type nearer than that level keeps winning.
