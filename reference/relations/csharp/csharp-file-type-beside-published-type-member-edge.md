---
id: csharp-file-type-beside-published-type-member-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.4 (simple names: the members of the enclosing type, inherited ones included and from every part of a partial type, are read before any namespace member); the C# 11 file-local types proposal (a file type belongs to its file, and a type of the same name in another file is another type)"
---

## Rule

A public `partial class Helper` declares the property `Settings` in one part, so `Settings.Get(1)` in its other part reads that property and gives no edge. A third file declares `file class Helper : Bag`, and neither it nor `Bag` declares `Settings`: there the call names the static class `App.Settings` of node legacy. The members of the public type are not read for the `file` type.

## Files

```csharp path=src/core/Bag.cs
namespace App.Core;
public class Bag { }
public class SettingsBag { public int Get(int k) => k; }
```

```csharp path=src/legacy/Settings.cs
namespace App;
public static class Settings { public static int Get(int k) => k; }
```

```csharp path=src/web/Helper.cs
using App.Core;
namespace App.Web;
public partial class Helper {
  protected SettingsBag Settings { get; } = new();
}
```

```csharp path=src/web/Helper.Run.cs
namespace App.Web;
public partial class Helper {
  int M() => Settings.Get(1);
}
```

```csharp path=src/tools/Tool.cs
using App.Core;
namespace App.Web;
file class Helper : Bag {
  int M() => Settings.Get(1);
}
```

## Expect

- src/web/Helper.cs:4 -> node:core         # the written type of the property
- src/tools/Tool.cs:3 -> node:core         # the base class of the file type
- src/tools/Tool.cs:4 -> node:legacy       # the file type has no member Settings: the static class

## Why

The file type is no part of the public type, whatever the two are called.
