---
id: csharp-internals-visible-to-parameter-condition-raw-greater-than-edge
language: csharp
category: trap
expectation: edge
cites: "C# spec §7.5.2 (accessibility domains); MSBuild conditions (a raw `>` inside a quoted attribute value is valid XML); the .NET SDK turns an `<AssemblyAttribute>` item of InternalsVisibleTo into the assembly attribute"
---

## Rule

A `>` inside a quoted attribute value ends no tag. The `<_Parameter1>` child of an `InternalsVisibleTo` assembly attribute item whose `Condition` holds a raw `>` is read, so it names the one friend assembly it holds and not every project: Lib's `Order` is internal, Web.Tests is named and binds it, and Web, which references Lib too but is not named, binds nothing.

## Files

```xml path=src/Lib/Lib.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <AssemblyAttribute Include="System.Runtime.CompilerServices.InternalsVisibleTo">
      <_Parameter1 Condition="'$(LangVersion)' > '10'">Web.Tests</_Parameter1>
    </AssemblyAttribute>
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

The child element was not found, and an item with an attribute and no readable parameter is read as naming every project, so a repository's internal types were shown to assemblies that cannot see them.
