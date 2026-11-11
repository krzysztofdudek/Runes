---
id: csharp-published-type-beside-file-type-with-base-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (the nested types of a type's base classes are its members); the C# 11 file-local types proposal (a file type belongs to its file, and a type of the same name in another file is another type)"
---

## Rule

A public `class Worker` lists no base. Another file declares `file class Worker : WorkerBase` in the same namespace, and `WorkerBase` of node core nests `Options`. The base belongs to the `file` type alone: inside the public `Worker`, the bare `Options` names the `App.Jobs.Options` of node cfg, and inside the `file` type it names `WorkerBase.Options`.

## Files

```csharp path=src/core/WorkerBase.cs
namespace App.Core;
public class WorkerBase { public class Options { } }
```

```csharp path=src/cfg/Options.cs
namespace App.Jobs;
public class Options { }
```

```csharp path=src/jobs/Worker.cs
namespace App.Jobs;
public class Worker {
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

- src/jobs/Worker.cs:3 -> node:cfg         # the public Worker has no base: the namespace's Options
- src/tools/Tool.cs:3 -> node:core         # the base class of the file type
- src/tools/Tool.cs:4 -> node:core         # WorkerBase+Options, inherited by the file type

## Why

Two types share a full name here, and only one of them has the base.
