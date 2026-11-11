---
id: csharp-using-static-nested-type-namespace-body-hides-global-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5.4 (using static imports nested types); §7.8.1 (inside namespace App.Web, the using directives of that namespace declaration are read before the global namespace's members)"
---

## Rule

A `using static T;` inside a namespace body imports the nested types of `T` at the level of that namespace, so it is read before the global namespace. `Circle` inside `namespace App.Web` with `using static App.Core.Shapes;` names `Shapes.Circle`, never the global `Circle` that lies farther out.

## Files

```csharp path=src/core/Shapes.cs
namespace App.Core;
public static class Shapes { public class Circle { } }
```

```csharp path=src/web/Draw.cs
namespace App.Web {
  using static App.Core.Shapes;
  public class Draw {
    Circle c;
  }
}
```

```csharp path=src/legacy/Circle.cs
public class Circle { }
```

## Expect

- src/web/Draw.cs:2 -> node:core      # the directive's target type
- src/web/Draw.cs:4 -> node:core      # Shapes.Circle; the global Circle (node legacy) is farther out

## Why

The nested types a using static directive imports were never read, so the bare name fell through to a farther global type of the same name and gave a false edge to it.
