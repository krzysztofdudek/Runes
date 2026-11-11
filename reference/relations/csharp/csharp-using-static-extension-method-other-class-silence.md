---
id: csharp-using-static-extension-method-other-class-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §14.5.4 (a using static directive imports the members of the one type it names, not those of the other types of its namespace)"
---

## Rule

`using static T;` imports the extension methods of `T` alone. A static class `Other` of the same namespace that declares a method of the same name is not imported, so the call binds nothing in `Other`'s file. (A plain `using App.Ext;` would import both classes.)

## Files

```csharp path=src/ext/StringExt.cs
namespace App.Ext;
public static class StringExt { public static string Trim2(this string s) => s; }
```

```csharp path=src/other/OtherExt.cs
namespace App.Ext;
public static class OtherExt { public static string Shout(this string s) => s; }
```

```csharp path=src/web/A.cs
using static App.Ext.StringExt;
namespace App.Web;
public class A {
  public string M(string s) => s.Shout();
}
```

## Expect

- src/web/A.cs:1 -> node:ext      # the directive's target type StringExt; `Shout` is declared in OtherExt, which the directive does not import, so line 4 gives no edge of its own

## Why

Treating a using static as a namespace import would bind an extension method of a class the directive never imports.
