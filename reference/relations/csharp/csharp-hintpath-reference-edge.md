---
id: csharp-hintpath-reference-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild — a <Reference> with a HintPath names an assembly by file; an in-repository project that builds that assembly is a reference to it"
---

## Rule

A `<Reference Include="Name"><HintPath>…\Name.dll</HintPath></Reference>` references the assembly the repository's own project of that name builds (the assembly name, by default the project file's name). It is a reference to that project even though it is no `ProjectReference`: a fuzzing project that links the built API assembly gets its edge. A reference to an assembly no project of the repository builds is external and adds nothing.

## Files

```xml path=fuzz/ApiFuzz/ApiFuzz.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <Reference Include="Acme.Api">
      <HintPath>..\..\src\Acme.Api\bin\Release\net8.0\Acme.Api.dll</HintPath>
    </Reference>
    <Reference Include="Newtonsoft.Json, Version=13.0.0.0">
      <HintPath>..\libs\Newtonsoft.Json.dll</HintPath>
    </Reference>
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

- fuzz/ApiFuzz/Program.cs:4 -> node:Acme.Api      # the HintPath names the assembly Acme.Api builds

## Why

A closure of `ProjectReference` alone would have dropped the two real edges of that shape in jellyfin's `fuzz/*/Program.cs`.
