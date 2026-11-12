---
id: csharp-file-type-dotted-receiver-inherited-nested-type-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (the nested types of a type's base classes are its members); §12.8.7.2 (a simple name that names a type, then a member access through it)"
---

## Rule

`Worker.Options.Parse()` reads `Worker`, a `file` class this file declares, then its member `Options`, a nested type of its base class `WorkerBase`, and calls a static method of that type. The first name is a type of the file, not a value, so the receiver is read: its nested type is `WorkerBase.Options` of node core.

## Files

```csharp path=src/core/WorkerBase.cs
namespace App;
public class WorkerBase {
  public class Options {
    public static void Parse() { }
  }
}
```

```csharp path=src/web/Worker.cs
namespace App;
file class Worker : WorkerBase {
  void Run() {
    Worker.Options.Parse();
  }
}
```

## Expect

- src/web/Worker.cs:2 -> node:core      # the base class
- src/web/Worker.cs:4 -> node:core      # WorkerBase.Options, through the file class Worker

## Why

A receiver whose first name is a type the file declares was never read, as if it were a local or a field, so the call gave no edge to the nested type its base class declares.
