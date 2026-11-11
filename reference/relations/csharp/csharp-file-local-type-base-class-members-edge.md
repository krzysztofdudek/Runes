---
id: csharp-file-local-type-base-class-members-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 and §12.8.4 (the members of the base classes of an enclosing type, nested types included, are read before any namespace); the C# 11 file-local types proposal (a file type is a type like any other inside its file)"
---

## Rule

A `file class Worker` derives from `WorkerBase` of node core, which nests `Options` and declares the property `Settings`. Inside `Worker`, the bare `Options` names `WorkerBase.Options`, not the `App.Jobs.Options` of node cfg, and `Settings.Get(1)` reads the inherited property, not the static class `App.Settings` of node legacy.

## Files

```csharp path=src/core/WorkerBase.cs
namespace App.Core;
public class SettingsBag { public int Get(int k) => k; }
public class WorkerBase { public class Options { } protected SettingsBag Settings { get; } = new(); }
```

```csharp path=src/cfg/Options.cs
namespace App.Jobs;
public class Options { }
```

```csharp path=src/legacy/Settings.cs
namespace App;
public static class Settings { public static int Get(int k) => k; }
```

```csharp path=src/jobs/Worker.cs
using App.Core;
namespace App.Jobs;
file class Worker : WorkerBase {
  Options _o;
  int M() => Settings.Get(1);
}
```

## Expect

- src/jobs/Worker.cs:3 -> node:core        # the base class
- src/jobs/Worker.cs:4 -> node:core        # WorkerBase+Options, inherited; line 5 reads an inherited property

## Why

The type keeps to its file; what it inherits does not.
