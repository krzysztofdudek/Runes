---
id: csharp-global-using-static-extension-method-edge
language: csharp
category: import
expectation: edge
cites: "C# 10 global using directives; C# spec §14.5.4 (using static makes extension methods available for extension invocation)"
---

## Rule

A `global using static T;` makes the extension methods of `T` callable in every file of its project, at the level of the compilation unit.

## Files

```csharp path=src/globals/Globals.cs
global using static App.Ext.StringExt;
```

```csharp path=src/ext/StringExt.cs
namespace App.Ext;
public static class StringExt { public static string Shout(this string s) => s; }
```

```csharp path=src/web/A.cs
namespace App.Web;
public class A {
  public string M(string s) => s.Shout();
}
```

## Expect

- src/globals/Globals.cs:1 -> node:ext      # the directive's target type
- src/web/A.cs:3 -> node:ext      # Shout, imported project-wide by the global using static

## Why

A global using static was read for its target only; the extension methods it makes available in the other files were never seen.
