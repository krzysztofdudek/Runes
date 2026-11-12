---
id: csharp-published-type-dotted-receiver-inherited-nested-type-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (the nested types of a type's base classes are its members); §12.8.7.2 (a simple name that names a type, then a member access through it)"
---

## Rule

The same receiver through a public class of this file: `Worker.Options.Parse()` reads `Worker`, a type this file declares and nothing else of that name, then `Options`, the nested type of its base class, so the edge goes to `WorkerBase.Options` of node core.

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
public class Worker : WorkerBase {
  void Run() {
    Worker.Options.Parse();
  }
}
```

## Expect

- src/web/Worker.cs:2 -> node:core      # the base class
- src/web/Worker.cs:4 -> node:core      # WorkerBase.Options, through the class Worker

## Why

A receiver whose first name is a type the file declares was never read, as if it were a local or a field, so the call gave no edge to the nested type its base class declares.
