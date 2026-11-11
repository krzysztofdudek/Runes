---
id: csharp-file-type-dotted-name-inherited-nested-type-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (the nested types of a type's base classes are its members); §12.8.7.1 (member access through a type name); C# 11 file-local types"
---

## Rule

`Worker.Options` names the member `Options` of `Worker`, and the nested types of a base class are members of the derived one. `Worker` is a `file` class of this file that derives from `WorkerBase`, so the type `Worker.Options` is `WorkerBase.Options` of node core.

## Files

```csharp path=src/core/WorkerBase.cs
namespace App;
public class WorkerBase {
  public class Options { }
}
```

```csharp path=src/core/Marker.cs
namespace App;
public class Marker { }
```

```csharp path=src/web/Worker.cs
namespace App;
file class Worker : WorkerBase { }
public class Host {
  Marker _m;
  object Make() {
    Worker.Options o = null;
    return o;
  }
}
```

## Expect

- src/web/Worker.cs:2 -> node:core
- src/web/Worker.cs:4 -> node:core
- src/web/Worker.cs:6 -> node:core      # WorkerBase.Options, through the file class Worker

## Why

A reading that led through a type the file keeps to itself ended there with no candidate, because no key names such a type, so the nested type its base class declares was never reached.
