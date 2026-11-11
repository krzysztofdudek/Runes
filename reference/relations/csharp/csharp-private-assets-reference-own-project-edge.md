---
id: csharp-private-assets-reference-own-project-edge
language: csharp
category: usage-site
expectation: edge
cites: "NuGet/MSBuild PrivateAssets=all on a ProjectReference hides the reference from consumers only; the referencing project itself compiles against it"
---

## Rule

`PrivateAssets="all"` limits what flows to the projects that reference the referencing project; the referencing project itself still sees the referenced project. Core uses Shared's `Order` while another project also declares `App.Shared.Order`; the project Core references is the one that binds.

## Files

```xml path=src/Shared/Shared.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Shared/Order.cs
namespace App.Shared;
public class Order { }
```

```xml path=src/Elsewhere/Elsewhere.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Elsewhere/Order.cs
namespace App.Shared;
public class Order { }
```

```xml path=src/Core/Core.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup><ProjectReference Include="..\Shared\Shared.csproj" PrivateAssets="all" /></ItemGroup>
</Project>
```

```csharp path=src/Core/Checkout.cs
using App.Shared;
namespace App.Core;
public class Checkout {
  Order _o;
}
```

## Expect

- src/Core/Checkout.cs:4 -> node:Shared

## Why

Reading the metadata must not take the reference away from the project that declares it.
