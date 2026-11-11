---
id: csharp-compile-remove-excluded-file-edge
language: csharp
category: trap
expectation: edge
cites: "MSBuild — a `<Compile Remove>` item takes the files it names out of the project's compilation, so their declarations do not exist for the compiler; C# spec §7.6.1 (a name binds only to a declaration the compilation can see)"
---

## Rule

Web removes `Old/**` from its compilation (`<Compile Remove="Old/**" />`). `Old/Order.cs` declares `App.Order`, and so does Core, which Web references. The removed file is part of no compilation, so it declares nothing: the own-project preference never chooses it, and `Order` in `Api.cs` binds Core's.

## Files

```xml path=src/Core/Core.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Core/Order.cs
namespace App;
public class Order { }
```

```xml path=src/Web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <Compile Remove="Old/**" />
    <ProjectReference Include="..\Core\Core.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Web/Old/Order.cs
namespace App;
public class Order { }
```

```csharp path=src/Web/Api.cs
namespace App;
public class Api {
  Order _o;
}
```

## Expect

- src/Web/Api.cs:3 -> node:Core      # the removed Old/Order.cs is in no compilation

## Why

The own-project preference made the removed file outrank the referenced project's type, a false edge to code the compiler never sees; before that preference the two definers silenced each other.
