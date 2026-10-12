---
id: csharp-reference-dll-path-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild — a <Reference> may name the assembly by the path of its file; the assembly's name is the file name without its extension"
---

## Rule

A `<Reference Include="..\..\src\Acme.Api\bin\Release\net8.0\Acme.Api.dll" />` names the assembly by its file, with no HintPath and no simple name. It references the assembly the repository's own project of that name builds, as the form with a HintPath does (csharp-hintpath-reference-edge).

## Files

```xml path=fuzz/ApiFuzz/ApiFuzz.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <Reference Include="..\..\src\Acme.Api\bin\Release\net8.0\Acme.Api.dll" />
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

- fuzz/ApiFuzz/Program.cs:4 -> node:Acme.Api      # the Include is the dll path of the assembly Acme.Api builds

## Why

Taking the whole Include as an assembly name matched no project and closed the fuzzing project, so this edge was lost.
