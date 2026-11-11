---
id: csharp-global-using-static-nested-type-edge
language: csharp
category: import
expectation: edge
cites: "C# 10 global using directives (a global using static applies to every file of the project); C# spec §14.5.4 (using static imports nested types)"
---

## Rule

A `global using static T;` is a using static directive of the compilation unit of every file of its project. Its target type is read from the global namespace, and the nested types of `T` are visible by their simple names in the other files of the project, at the level of the compilation unit.

## Files

```csharp path=src/globals/Globals.cs
global using static App.Core.Shapes;
```

```csharp path=src/core/Shapes.cs
namespace App.Core;
public static class Shapes { public class Circle { } }
```

```csharp path=src/web/Draw.cs
namespace App.Web;
public class Draw {
  Circle c;
}
```

## Expect

- src/globals/Globals.cs:1 -> node:core      # the directive's target type
- src/web/Draw.cs:3 -> node:core      # Circle, imported project-wide as Shapes.Circle

## Why

A global using static gave an edge for its target only; the nested types it imports project-wide were never read in the other files.
