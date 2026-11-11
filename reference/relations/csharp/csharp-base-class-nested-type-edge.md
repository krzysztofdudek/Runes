---
id: csharp-base-class-nested-type-edge
language: csharp
category: nested
expectation: edge
cites: "C# spec §7.6.1 (for each enclosing type T, the accessible nested types of T and of its base classes are read before any namespace member)"
---

## Rule

`MyHandler` derives from `HandlerBase`, which nests `Options`. Inside `MyHandler` the bare `Options` names `HandlerBase.Options` of node core, not `App.Web.Options` of node cfg, the member of the enclosing namespace.

## Files

```csharp path=src/core/HandlerBase.cs
namespace App.Core;
public abstract class HandlerBase { public class Options { } }
```

```csharp path=src/web/MyHandler.cs
using App.Core;
namespace App.Web;
public class MyHandler : HandlerBase {
  Options _o;
}
```

```csharp path=src/cfg/Options.cs
namespace App.Web;
public class Options { }
```

## Expect

- src/web/MyHandler.cs:3 -> node:core      # the base class
- src/web/MyHandler.cs:4 -> node:core      # HandlerBase+Options, inherited

## Why

A nested type of a base class is a member of the derived class, and a type's members are read before the namespace around it.
