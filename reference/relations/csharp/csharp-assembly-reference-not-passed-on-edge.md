---
id: csharp-assembly-reference-not-passed-on-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild — a consumer of a project is handed the project's assembly and its project and package references, not its plain assembly references"
---

## Rule

A `<Reference>` with a `HintPath` belongs to the project that holds it. A project that references Core does not see the assembly Core references. Web references Core, which holds a `Reference` to Acme.Legacy, and Lib: Legacy's `Order` is out of sight of Web, so `Order` binds Lib's.

## Files

```xml path=src/Acme.Legacy/Acme.Legacy.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Acme.Legacy/Order.cs
namespace App;
public class Order { }
```

```xml path=src/Core/Core.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <Reference Include="Acme.Legacy">
      <HintPath>..\Acme.Legacy\bin\Release\net8.0\Acme.Legacy.dll</HintPath>
    </Reference>
  </ItemGroup>
</Project>
```

```csharp path=src/Core/Engine.cs
namespace App.Core;
public class Engine { }
```

```xml path=src/Lib/Lib.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Lib/Order.cs
namespace App;
public class Order { }
```

```xml path=src/Web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Core\Core.csproj" />
    <ProjectReference Include="..\Lib\Lib.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Web/Page.cs
namespace App.Web;
public class Page {
  Order _o;
}
```

## Expect

- src/Web/Page.cs:3 -> node:Lib

## Why

An assembly reference of one project was read as a reference of every project that references it, which made a name that the assembly and a visible project both declare ambiguous.
