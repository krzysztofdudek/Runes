---
id: csharp-private-assets-reference-not-passed-on-edge
language: csharp
category: usage-site
expectation: edge
cites: "NuGet/MSBuild PrivateAssets=all on a ProjectReference: the reference does not flow to the consumers of the referencing project"
---

## Rule

Core references Shared with `PrivateAssets="all"`, so a project that references Core does not see Shared. Web references Core and Lib; the namespace `App.Shared` exists in Web's view through Lib, and Shared's `Order` is hidden, so `Order` binds Lib's `App.Lib.Order`.

## Files

```xml path=src/Shared/Shared.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Shared/Order.cs
namespace App.Shared;
public class Order { }
```

```xml path=src/Lib/Lib.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Lib/Order.cs
namespace App.Lib;
public class Order { }
```

```csharp path=src/Lib/Marker.cs
namespace App.Shared;
public class Marker { }
```

```xml path=src/Core/Core.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup><ProjectReference Include="..\Shared\Shared.csproj" PrivateAssets="all" /></ItemGroup>
</Project>
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
using App.Shared;
using App.Lib;
namespace App.Web;
public class Api {
  Order _o;
}
```

## Expect

- src/Web/Api.cs:5 -> node:Lib      # Shared reaches Web only through Core, and Core keeps it private

## Why

A reference that its owner keeps private was passed on to every consumer, and a name that both it and a visible project declare then read as ambiguous.
