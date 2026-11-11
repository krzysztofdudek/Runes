---
id: csharp-project-reference-without-output-assembly-element-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild ProjectReference metadata is an attribute or a child element of the item; ReferenceOutputAssembly=false passes no assembly to the compiler"
---

## Rule

The metadata of a `ProjectReference` may be written as a child element instead of an attribute; both mean the same. `<ReferenceOutputAssembly>false</ReferenceOutputAssembly>` inside the item hides the referenced project's types as the attribute does, and a wildcard reference with the metadata hides every project it matches.

## Files

```xml path=src/Api/Api.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Api/Clock.cs
namespace App;
public class Clock { }
```

```xml path=src/Jobs/Worker/Worker.csproj
<Project Sdk="Microsoft.NET.Sdk"></Project>
```

```csharp path=src/Jobs/Worker/Clock.cs
namespace App;
public class Clock { }
```

```xml path=src/Tests/Tests.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\Api\Api.csproj" />
    <ProjectReference Include="..\Jobs\**\*.csproj">
      <ReferenceOutputAssembly>false</ReferenceOutputAssembly>
    </ProjectReference>
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

- src/Tests/ClockTests.cs:3 -> node:Api

## Why

A reader that looked at the attributes alone would miss the metadata written the other way, which is common in hand-edited project files.
