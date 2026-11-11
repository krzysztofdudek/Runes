---
id: csharp-internal-type-other-project-not-candidate-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §7.5.2 (accessibility domains: an internal type, or a top-level type with no access modifier, is accessible only within its own assembly); CS0122"
---

## Rule

Web references Core and Lib. Core declares a public `App.Order`; Lib declares `App.Order` as `internal`. Lib grants Web nothing, so its `Order` is not accessible in Web and `Order` there binds Core's.

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
internal class Order { }
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

- src/Web/Api.cs:3 -> node:Core      # Lib's Order is internal to Lib

## Why

The access modifier was not read, so an internal type of a referenced project stayed a candidate and turned a single binding into an ambiguity.
