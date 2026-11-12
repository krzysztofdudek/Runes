---
id: csharp-assembly-name-condition-raw-greater-than-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild conditions (a raw `>` inside a quoted attribute value is valid XML); MSBuild — `AssemblyName` is the name a `<Reference>` to the project's output assembly uses"
---

## Rule

A `>` inside a quoted attribute value ends no tag. A project's `<AssemblyName>` property whose `Condition` holds a raw `>` is read, so a `<Reference>` that names the assembly by that name is a reference to the project, as it is with the `&gt;` spelling.

## Files

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

```xml path=src/Core/Core.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <AssemblyName Condition="'$(LangVersion)' > '10'">Acme.Api</AssemblyName>
  </PropertyGroup>
</Project>
```

```csharp path=src/Core/ApiClient.cs
namespace Acme.Api;
public class ApiClient { }
```

## Expect

- fuzz/ApiFuzz/Program.cs:4 -> node:Core      # the project's assembly is named Acme.Api by the property under the condition

## Why

The property was read through a start tag that ended at the first `>`, the one inside the condition, so the assembly name was never seen and the reference named no project.
