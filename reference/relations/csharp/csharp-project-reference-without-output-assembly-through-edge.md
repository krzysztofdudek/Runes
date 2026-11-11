---
id: csharp-project-reference-without-output-assembly-through-edge
language: csharp
category: usage-site
expectation: edge
cites: "NuGet restore — a ProjectReference joins the restore graph only when ReferenceOutputAssembly is empty or true, and transitive project references come from that graph"
---

## Rule

A project that Tests reaches through a normal reference does not pass on what it reaches through a build-order reference. Tests references Api, a normal reference; Api references Core with `ReferenceOutputAssembly="false"`, and Core references Model. Tests sees Api and Api's normal references only, so Model's `Order` is out of sight and `Order` binds Lib's.

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
  </ItemGroup>
</Project>
```

```csharp path=src/Api/Gateway.cs
namespace App.Api;
public class Gateway { }
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

- src/Tests/OrderTests.cs:3 -> node:Lib

## Why

The chain through a build-order reference was followed to its end, so Tests was given a project the compiler never hands it.
