---
id: csharp-hintpath-attribute-reference-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild items (a piece of item metadata may be written as an attribute of the item as well as a child element; `HintPath` is metadata of `Reference`)"
---

## Rule

Item metadata may be written as an attribute. `<Reference Include="X" HintPath="..\..\src\Acme.Api\bin\Acme.Api.dll" />` names the assembly by the file of its `HintPath`, exactly as the child element `<HintPath>` does, so it references the project of the repository that builds that assembly even though its `Include` names something else.

## Files

```xml path=fuzz/ApiFuzz/ApiFuzz.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <Reference Include="Api" HintPath="..\..\src\Acme.Api\bin\Release\net8.0\Acme.Api.dll" />
  </ItemGroup>
</Project>
```

```csharp path=fuzz/ApiFuzz/Program.cs
using Acme.Api;
namespace ApiFuzz;
public class Harness {
  public void Run() { var c = new ApiClient(); }
}
```

```xml path=src/Acme.Api/Acme.Api.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Acme.Api/ApiClient.cs
namespace Acme.Api;
public class ApiClient { }
```

## Expect

- fuzz/ApiFuzz/Program.cs:4 -> node:Acme.Api      # the HintPath attribute names the assembly Acme.Api builds

## Why

Only the child element form was read, so with an `Include` that names no project the referencing project lost sight of the one its `HintPath` points at.
