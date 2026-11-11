---
id: csharp-delegate-file-local-not-published-edge
language: csharp
category: trap
expectation: edge
cites: "C# 11 — file-local types (`file` modifier), a delegate among them; C# spec §7.6.1"
---

## Rule

A `file delegate` is visible only in its own file, as a `file class` is, so it is not a cross-file target and hides nothing: the bare `Hook` in `App.Web` names `Lib.Hook` (node lib) through the using directive, not the file-local `App.Hook` of node core.

## Files

```csharp path=src/core/Hook.cs
namespace App;
file delegate void Hook(int id);
```

```csharp path=src/lib/Hook.cs
namespace Lib;
public class Hook { }
```

```csharp path=src/web/Bus.cs
using Lib;
namespace App.Web;
public class Bus {
  Hook _h;
}
```

## Expect

- src/web/Bus.cs:4 -> node:lib      # the file-local delegate App.Hook is not published, so Lib.Hook is the one the name reaches

## Why

Publishing a file-local delegate would make it hide the imported class of the same name in every file of its namespace.
