---
id: csharp-using-static-nested-type-edge
language: csharp
category: import
expectation: edge
cites: "C# spec §14.5.4 (a using static directive imports the nested types of the type it names); §7.8.1 (the compilation unit's using directives are read after the global namespace's own members)"
---

## Rule

`using static T;` makes the types nested in `T` visible by their simple names in the body that holds the directive. In the compilation unit that is the last level of the lookup, so `using static App.Core.Shapes;` lets the bare `Circle` name the type `Shapes.Circle`, and the reference is a dependency on the file that declares `Shapes`. The directive imports no namespace: only the nested types and the static members of the one type it names.

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

## Expect

- src/web/Draw.cs:1 -> node:core      # the directive's target type
- src/web/Draw.cs:4 -> node:core      # `Circle` is Shapes.Circle, imported by the directive

## Why

Only the directive's target was read, so a type that the directive imports as a nested type of its target gave no edge.
