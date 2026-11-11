---
id: csharp-project-reference-without-output-assembly-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild ProjectReference metadata ReferenceOutputAssembly=false: the referenced assembly is built first but not passed to the compiler"
---

## Rule

A `<ProjectReference … ReferenceOutputAssembly="false" />` is a build-order dependency: the referencing project is compiled without the referenced project's assembly and sees none of its types. Tests references Api (types visible) and Worker with `ReferenceOutputAssembly="false"`; both declare a public `App.Clock`, and `Clock` in Tests binds Api's, not an ambiguity between the two.

## Files

```xml path=src/Api/Api.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Api/Clock.cs
namespace App;
public class Clock { }
```

```xml path=src/Worker/Worker.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Worker/Clock.cs
namespace App;
public class Clock { }
```

```xml path=src/Tests/Tests.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Api\Api.csproj" />
    <ProjectReference Include="..\Worker\Worker.csproj" ReferenceOutputAssembly="false" />
  </ItemGroup>
</Project>
```

```csharp path=src/Tests/ClockTests.cs
namespace App.Tests;
public class ClockTests {
  Clock _c;
}
```

## Expect

- src/Tests/ClockTests.cs:3 -> node:Api      # Worker is built first and invisible

## Why

A reference that is only a build order gave the referencing project the other project's types, and a type name both projects declare then read as ambiguous and lost its edge.
