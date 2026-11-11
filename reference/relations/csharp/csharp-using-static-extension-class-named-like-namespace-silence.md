---
id: csharp-using-static-extension-class-named-like-namespace-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §14.5.3 (a using namespace directive imports the types of the namespace, and the extension methods of those types); §14.5.4 (only a using static directive imports the extension methods of one class)"
---

## Rule

A static class `Foo.Extensions` and a namespace `Foo.Extensions` can both exist in a repository (two projects, or a rename under way). `using Foo.Extensions;` imports the types of the namespace and the extension methods those types declare, never the methods of the class `Foo.Extensions`, which only `using static Foo.Extensions;` imports. So `s.Bar()` through the plain using binds nothing here.

## Files

```csharp path=src/cls/Extensions.cs
namespace Foo;
public static class Extensions { public static string Bar(this string s) => s; }
```

```csharp path=src/ns/Marker.cs
namespace Foo.Extensions;
public class Marker { }
```

```csharp path=src/use/Use.cs
using Foo.Extensions;
namespace App;
class A {
  string M(string s) => s.Bar();
}
```

## Expect

- silence      # the class Foo.Extensions is not imported by the namespace directive

## Why

The key an extension method has in its class had the shape of a key in a namespace of the same name, so a plain using of that namespace reached the class's method, a false edge.
