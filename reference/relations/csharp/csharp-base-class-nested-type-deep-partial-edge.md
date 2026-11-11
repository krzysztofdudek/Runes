---
id: csharp-base-class-nested-type-deep-partial-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (the nested types of the base classes of an enclosing type); §15.2.7 (a base a part of a partial type lists is the base of the whole type)"
---

## Rule

`Worker` lists its base in another part, in another file; that base `Middle` derives from `Root`, which nests `Settings`. The bare `Settings` in `Worker` names `Root.Settings` of node core through both steps, not the `App.Jobs.Settings` of node cfg.

## Files

```csharp path=src/core/Root.cs
namespace App.Core;
public class Root { public class Settings { } }
```

```csharp path=src/mid/Middle.cs
namespace App.Core;
public class Middle : Root { }
```

```csharp path=src/jobs/Worker.Base.cs
using App.Core;
namespace App.Jobs;
public partial class Worker : Middle { }
```

```csharp path=src/jobs/Worker.cs
namespace App.Jobs;
public partial class Worker {
  Settings _s;
}
```

```csharp path=src/cfg/Settings.cs
namespace App.Jobs;
public class Settings { }
```

## Expect

- src/mid/Middle.cs:2 -> node:core
- src/jobs/Worker.Base.cs:3 -> node:mid
- src/jobs/Worker.cs:3 -> node:core       # Root+Settings, through Middle

## Why

The base list is read from every part of the type, and each base is followed to its own base while the repository declares it.
