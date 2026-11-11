---
id: csharp-file-type-beside-file-type-with-base-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (the nested types of a type's base classes are its members); the C# 11 file-local types proposal (two files may each declare a file type of one name, and they are two types)"
---

## Rule

Two files each declare a `file class Worker` in one namespace. The one in `Tool.cs` derives from `WorkerBase` of node core, which nests `Options`; the one in `Job.cs` lists no base. Each reads its own file's base list: `Options` in `Job.cs` names the `App.Jobs.Options` of node cfg, and in `Tool.cs` it names `WorkerBase.Options`.

## Files

```csharp path=src/core/WorkerBase.cs
namespace App.Core;
public class WorkerBase { public class Options { } }
```

```csharp path=src/cfg/Options.cs
namespace App.Jobs;
public class Options { }
```

```csharp path=src/jobs/Job.cs
namespace App.Jobs;
file class Worker {
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

- src/jobs/Job.cs:3 -> node:cfg            # this file's Worker has no base: the namespace's Options
- src/tools/Tool.cs:3 -> node:core         # the base class of this file's Worker
- src/tools/Tool.cs:4 -> node:core         # WorkerBase+Options, inherited

## Why

A file type's base list is read for the type of that file and for no other.
