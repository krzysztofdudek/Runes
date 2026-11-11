---
id: csharp-pattern-switch-constants-of-nearer-type-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §7.8.1 (the first name of a dotted name is looked up nearest scope first), §11.2.3 (constant pattern), §13.8.3 (switch statement), §12.11 (switch expression)"
---

## Rule

`case Colors.Red:` and the switch arm `Colors.Blue =>` name enum members of `App.Colors` (node palette), which the enclosing namespace `App` holds. A namespace `Colors` of the global namespace holding classes `Red` and `Blue` (node other) is farther, so the edge goes to node palette only.

## Files

```csharp path=src/palette/Colors.cs
namespace App;
public enum Colors { Red, Blue }
```

```csharp path=src/other/Shades.cs
namespace Colors;
public class Red { }
public class Blue { }
```

```csharp path=src/web/Paint.cs
namespace App.Web;
public class Paint {
  public int A(App.Colors c) { switch (c) { case Colors.Red: return 1; default: return 0; } }
  public int B(App.Colors c) => c switch { Colors.Blue => 1, _ => 0 };
}
```

## Expect

- src/web/Paint.cs:3 -> node:palette      # `case Colors.Red:` names the enum, not Colors.Red of node other
- src/web/Paint.cs:4 -> node:palette      # the arm `Colors.Blue =>`

## Why

The enum is found at the enclosing namespace before the global one; its members are values, so no farther type is read.
