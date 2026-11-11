---
id: csharp-published-partial-type-beside-file-type-inherited-member-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.4 (simple names: the members of the enclosing type, inherited ones included, are read before any namespace member); the C# 11 file-local types proposal (a file type belongs to its file, and a type of the same name in another file is another type)"
---

## Rule

A public `partial class Helper` lists no base and no part of it declares `Settings`, so `Settings.Get(1)` there names the static class `App.Settings` of node legacy. Another file declares `file class Helper : AppController`, which inherits the property `Settings`: there the same call reads the property and gives no edge. What the `file` type inherits is not read for the public type.

## Files

```csharp path=src/core/AppController.cs
namespace App.Core;
public class SettingsBag { public int Get(int k) => k; }
public class AppController { protected SettingsBag Settings { get; } = new(); }
```

```csharp path=src/legacy/Settings.cs
namespace App;
public static class Settings { public static int Get(int k) => k; }
```

```csharp path=src/web/Helper.cs
namespace App.Web;
public partial class Helper {
  int M() => Settings.Get(1);
}
```

```csharp path=src/tools/Tool.cs
using App.Core;
namespace App.Web;
file class Helper : AppController {
  int M() => Settings.Get(1);
}
```

## Expect

- src/web/Helper.cs:3 -> node:legacy       # no part and no base of the public Helper declares Settings: the static class
- src/tools/Tool.cs:3 -> node:core         # the base class of the file type; line 4 reads the property it inherits

## Why

A partial type asks every part for a member, and a file type of the same name is no part of it.
