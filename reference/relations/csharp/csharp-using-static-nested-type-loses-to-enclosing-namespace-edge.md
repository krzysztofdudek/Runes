---
id: csharp-using-static-nested-type-loses-to-enclosing-namespace-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §7.8.1 (the enclosing namespaces are read nearest first, each before the using directives of the compilation unit); §14.5.4"
---

## Rule

A `using static` directive of the compilation unit is read after every namespace around the reference. A type `Circle` in the enclosing namespace `App.Web` is nearer than the nested `Shapes.Circle` the directive imports, so `Circle` names the namespace's own type.

## Files

```csharp path=src/core/Shapes.cs
namespace App.Core;
public static class Shapes { public class Circle { } }
```

```csharp path=src/shapes/Circle.cs
namespace App.Web;
public class Circle { }
```

```csharp path=src/web/Draw.cs
using static App.Core.Shapes;
namespace App.Web;
public class Draw {
  Circle c;
}
```

## Expect

- src/web/Draw.cs:1 -> node:core        # the directive's target type
- src/web/Draw.cs:4 -> node:shapes      # App.Web.Circle comes before the compilation unit's using static

## Why

The import is the farthest level of the lookup, so a type of an enclosing namespace must win over it.
