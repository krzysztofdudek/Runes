---
id: csharp-project-reference-without-output-assembly-not-followed-edge
language: csharp
category: usage-site
expectation: edge
cites: "NuGet restore — a ProjectReference joins the restore graph only when ReferenceOutputAssembly is empty or true, and transitive project references come from that graph"
---

## Rule

A reference with `ReferenceOutputAssembly="false"` is outside the restore graph: the referencing project sees neither the referenced project nor anything that project references, and it passes none of that on to its own consumers. Here Tests reaches Api, which holds the build-order reference to Core, and Core references Model: Model's `Order` stays out of sight of Tests and of Api, so `Order` binds Lib's, the project each of them also references.

## Files

```xml path=src/Model/Model.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Model/Order.cs
namespace App;
public class Order { }
```

```xml path=src/Core/Core.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup><ProjectReference Include="..\Model\Model.csproj" /></ItemGroup>
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

```xml path=src/Api/Api.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Core\Core.csproj" ReferenceOutputAssembly="false" />
    <ProjectReference Include="..\Lib\Lib.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Api/Orders.cs
namespace App.Api;
public class Orders {
  Order _o;
}
```

```xml path=src/Tests/Tests.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Api\Api.csproj" />
    <ProjectReference Include="..\Lib\Lib.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Tests/OrderTests.cs
namespace App.Tests;
public class OrderTests {
  Order _o;
}
```

## Expect

- src/Api/Orders.cs:3 -> node:Lib      # Core is built first and not handed to Api; its Model is not Api's
- src/Tests/OrderTests.cs:3 -> node:Lib      # Api's build-order reference to Core does not reach Tests

## Why

The referenced project's own references were followed as if the build-order reference were a normal one, so a name that Model and Lib both declare read as ambiguous and lost its edge.
