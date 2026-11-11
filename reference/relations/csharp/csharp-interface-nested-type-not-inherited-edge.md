---
id: csharp-interface-nested-type-not-inherited-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (the nested types of the base classes of T; the interfaces a class implements are not its base classes, §15.2.4)"
---

## Rule

`Job` implements `IJob`, which nests `Options` (C# 8). A class does not inherit the members of the interfaces it implements, so the bare `Options` in `Job` names `App.Jobs.Options` of node cfg, the member of the enclosing namespace.

## Files

```csharp path=src/core/IJob.cs
namespace App.Core;
public interface IJob { public class Options { } }
```

```csharp path=src/jobs/Job.cs
using App.Core;
namespace App.Jobs;
public class Job : IJob {
  Options _o;
}
```

```csharp path=src/cfg/Options.cs
namespace App.Jobs;
public class Options { }
```

## Expect

- src/jobs/Job.cs:3 -> node:core          # the interface
- src/jobs/Job.cs:4 -> node:cfg           # App.Jobs.Options

## Why

Only the base class chain hands nested types down.
