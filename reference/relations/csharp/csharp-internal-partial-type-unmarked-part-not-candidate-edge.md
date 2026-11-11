---
id: csharp-internal-partial-type-unmarked-part-not-candidate-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §15.2.7 (partial declarations: every part that carries an accessibility modifier agrees with the others, and a part without one takes theirs); §7.5.2 (an internal type is accessible only within its own assembly)"
---

## Rule

The parts of a partial type are one type with one accessibility: a part that carries no access modifier takes the one another part of the same project writes. Lib declares `internal partial class Order` in one file and `partial class Order` in another, so both parts are internal to Lib, and `Order` in Web, which references Core and Lib, binds Core's public `Order`.

## Files

```xml path=src/Core/Core.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Core/Order.cs
namespace App;
public class Order { }
```

```xml path=src/Lib/Lib.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Lib/Order.cs
namespace App;
internal partial class Order { }
```

```csharp path=src/Lib/Order.Lines.cs
namespace App;
partial class Order {
  public class Line { }
}
```

```xml path=src/Web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Core\Core.csproj" />
    <ProjectReference Include="..\Lib\Lib.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Web/Api.cs
namespace App;
public class Api {
  Order _o;
}
```

## Expect

- src/Web/Api.cs:3 -> node:Core      # both parts of Lib's Order are internal to Lib

## Why

A part without an access modifier was read by itself, as a type whose reach is not known, so it stayed a candidate beside Core's `Order` and the two made the name ambiguous.
