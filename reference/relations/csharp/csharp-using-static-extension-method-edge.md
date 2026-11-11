---
id: csharp-using-static-extension-method-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5.4 (a using static directive makes the extension methods of the type available for extension invocation); §12.8.10.3"
---

## Rule

`using static T;` makes the extension methods declared in the static class `T` callable in extension form. `using static App.Ext.StringExt;` lets `s.Shout()` bind the method `Shout` of `StringExt`, and the call is a dependency on the file that declares it.

## Files

```csharp path=src/ext/StringExt.cs
namespace App.Ext;
public static class StringExt { public static string Shout(this string s) => s; }
```

```csharp path=src/web/A.cs
using static App.Ext.StringExt;
namespace App.Web;
public class A {
  public string M(string s) => s.Shout();
}
```

## Expect

- src/web/A.cs:1 -> node:ext      # the directive's target type
- src/web/A.cs:4 -> node:ext      # Shout, an extension method imported by the directive

## Why

Only the directive's target was read, so an extension call the directive makes available gave no edge.
