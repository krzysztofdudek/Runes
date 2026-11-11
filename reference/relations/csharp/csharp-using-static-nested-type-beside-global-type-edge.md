---
id: csharp-using-static-nested-type-beside-global-type-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §7.8.1 (at the global namespace a member type of that name is taken before the using directives of the compilation unit, which is its declaration); §14.5.4"
---

## Rule

The nested types a `using static` directive of the compilation unit imports are read at the level of the compilation unit, after the global namespace's own members. With `using static App.Core.Shapes;` at the top of a file and a type `Circle` declared in the global namespace, `Circle` names the global type, never `Shapes.Circle`.

## Files

```csharp path=src/core/Shapes.cs
namespace App.Core;
public static class Shapes { public class Circle { } }
```

```csharp path=src/web/Draw.cs
using static App.Core.Shapes;
namespace App.Web;
public class Draw {
  Circle c;
}
```

```csharp path=src/legacy/Circle.cs
public class Circle { }
```

## Expect

- src/web/Draw.cs:1 -> node:core        # the directive's target type
- src/web/Draw.cs:4 -> node:legacy      # the global namespace's own Circle comes before the compilation unit's using static

## Why

An imported nested type must not outrank a member of the global namespace; reading the import at its own level keeps the nearer type.
