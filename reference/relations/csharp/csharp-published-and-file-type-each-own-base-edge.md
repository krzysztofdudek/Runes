---
id: csharp-published-and-file-type-each-own-base-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (the nested types of a type's base classes are its members); the C# 11 file-local types proposal (a file type belongs to its file, and a type of the same name in another file is another type)"
---

## Rule

A public `class Worker : Other` and a `file class Worker : WorkerBase` of another file share a full name, and each base nests an `Options`. Each type reads its own base: `Options` in the public `Worker` names `Other.Options` of node oth, and in the `file` type it names `WorkerBase.Options` of node core. Neither falls to the `App.Jobs.Options` of node cfg.

## Files

```csharp path=src/core/WorkerBase.cs
namespace App.Core;
public class WorkerBase { public class Options { } }
```

```csharp path=src/oth/Other.cs
namespace App.Oth;
public class Other { public class Options { } }
```

```csharp path=src/cfg/Options.cs
namespace App.Jobs;
public class Options { }
```

```csharp path=src/jobs/Worker.cs
using App.Oth;
namespace App.Jobs;
public class Worker : Other {
  Options _o;
}
```

```csharp path=src/tools/Tool.cs
using App.Core;
namespace App.Jobs;
file class Worker : WorkerBase {
  Options _o;
}
```

## Expect

- src/jobs/Worker.cs:3 -> node:oth         # the base class of the public Worker
- src/jobs/Worker.cs:4 -> node:oth         # Other+Options, inherited by the public Worker
- src/tools/Tool.cs:3 -> node:core         # the base class of the file type
- src/tools/Tool.cs:4 -> node:core         # WorkerBase+Options, inherited by the file type

## Why

Read together, the two base lists would name two types and the reference would bind neither.
