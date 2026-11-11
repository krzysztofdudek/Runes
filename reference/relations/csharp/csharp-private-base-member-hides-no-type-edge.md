---
id: csharp-private-base-member-hides-no-type-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.4; §7.5.4 (a private member is accessible only within its declaring type, so a derived type does not see it)"
---

## Rule

`ReportBase` of node core declares a private field `Settings`. In the derived `Report`, `Settings.Get(1)` cannot name that field, so it is the static class `App.Settings` of node legacy.

## Files

```csharp path=src/core/ReportBase.cs
namespace App.Core;
public class ReportBase { private int Settings = 1; int Size() => Settings; }
```

```csharp path=src/legacy/Settings.cs
namespace App;
public static class Settings { public static int Get(int k) => k; }
```

```csharp path=src/web/Report.cs
using App.Core;
namespace App.Web;
public class Report : ReportBase {
  public int M() => Settings.Get(1);
}
```

## Expect

- src/web/Report.cs:3 -> node:core
- src/web/Report.cs:4 -> node:legacy       # the static class App.Settings

## Why

A member the derived class cannot access hides nothing there.
