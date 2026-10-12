---
id: csharp-assembly-name-in-props-reference-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild — a property set in Directory.Build.props is the property of every project below it, the assembly name included"
---

## Rule

A `Directory.Build.props` that sets `<AssemblyName>Acme.$(MSBuildProjectName)</AssemblyName>` gives every project below it that assembly name, whatever its own project file says. A `<Reference Include="Acme.Api" />` elsewhere therefore references the project `src/Api/Api.csproj`, and the type of that project binds.

## Files

```xml path=src/Directory.Build.props
<Project>
  <PropertyGroup>
    <AssemblyName>Acme.$(MSBuildProjectName)</AssemblyName>
  </PropertyGroup>
</Project>
```

```xml path=src/Api/Api.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Api/ApiClient.cs
namespace Acme.Api;
public class ApiClient { }
```

```xml path=fuzz/ApiFuzz/ApiFuzz.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <Reference Include="Acme.Api" />
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

## Expect

- fuzz/ApiFuzz/Program.cs:4 -> node:Api      # the props file names the assembly Acme.Api for the project Api

## Why

Reading the assembly names from the project files alone found no project called Acme.Api, so the reference was taken for an external one and the edge was lost.
