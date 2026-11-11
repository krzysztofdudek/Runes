---
id: csharp-internal-type-internals-visible-to-item-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §7.5.2 (accessibility domains); the .NET SDK turns an `<InternalsVisibleTo Include>` item into the assembly attribute of the same name"
---

## Rule

Lib's `Order` is `internal`, and Lib's project file grants Web.Tests its internals with `<InternalsVisibleTo Include="$(MSBuildProjectName).Tests" />`, which the SDK reads as `Lib.Tests`, and with `<InternalsVisibleTo Include="Web.Tests" />`. Web.Tests references Lib, so `Order` there binds Lib's; Web, which references Lib too but is not named, binds nothing.

## Files

```xml path=src/Lib/Lib.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <InternalsVisibleTo Include="$(MSBuildProjectName).Tests" />
    <InternalsVisibleTo Include="Web.Tests" />
  </ItemGroup>
</Project>
```

```csharp path=src/Lib/Order.cs
namespace App;
internal class Order { }
```

```xml path=src/Web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
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

```xml path=src/Web.Tests/Web.Tests.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Lib\Lib.csproj" />
  </ItemGroup>
</Project>
```

```csharp path=src/Web.Tests/ApiTests.cs
namespace App;
public class ApiTests {
  Order _o;
}
```

## Expect

- src/Web.Tests/ApiTests.cs:3 -> node:Lib      # Lib names Web.Tests as a friend; Web gets nothing

## Why

The project-file form of the grant is the usual one in an SDK-style repository, and a test project is the usual friend.
