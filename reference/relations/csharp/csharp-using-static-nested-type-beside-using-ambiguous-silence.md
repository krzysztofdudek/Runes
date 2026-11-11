---
id: csharp-using-static-nested-type-beside-using-ambiguous-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §14.5.3 and §14.5.4 (the types a using namespace directive imports and the nested types a using static directive imports of one level form one set); CS0104 (ambiguous reference)"
---

## Rule

The types imported by a plain `using N;` and the nested types imported by a `using static T;` of the same level are looked up together. When both supply a type of the name, the reference is ambiguous (CS0104) and binds nothing. The target of the using static is still a dependency.

## Files

```csharp path=src/core/Shapes.cs
namespace App.Core;
public static class Shapes { public class Circle { } }
```

```csharp path=src/geo/Circle.cs
namespace App.Geo;
public class Circle { }
```

```csharp path=src/web/Draw.cs
using App.Geo;
using static App.Core.Shapes;
namespace App.Web;
public class Draw {
  Circle c;
}
```

## Expect

- src/web/Draw.cs:2 -> node:core      # the directive's target type; `Circle` on line 5 is ambiguous and gives no edge

## Why

Reading only the plain using made the ambiguous name bind the namespace's type, an edge a compiler would refuse.
