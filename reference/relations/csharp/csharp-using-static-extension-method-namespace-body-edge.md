---
id: csharp-using-static-extension-method-namespace-body-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5.4; §12.8.10.3 (extension method lookup goes through the enclosing namespace declarations, each with its using directives, nearest first)"
---

## Rule

A `using static T;` inside a namespace body makes the extension methods of `T` callable in the references of that body, at the level of that namespace. A reference elsewhere in the file does not see them.

## Files

```csharp path=src/ext/StringExt.cs
namespace App.Ext;
public static class StringExt { public static string Shout(this string s) => s; }
```

```csharp path=src/web/A.cs
namespace App.Web {
  using static App.Ext.StringExt;
  public class A {
    public string M(string s) => s.Shout();
  }
}
namespace App.Other {
  public class B {
    public string M(string s) => s.Shout();
  }
}
```

## Expect

- src/web/A.cs:2 -> node:ext      # the directive's target type
- src/web/A.cs:4 -> node:ext      # inside the body that holds the directive; line 9, in another body, sees no Shout

## Why

The extension methods of a using static were not read, and a directive of a namespace body must reach its own body only.
