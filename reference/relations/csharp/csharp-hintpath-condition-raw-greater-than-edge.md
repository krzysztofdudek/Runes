---
id: csharp-hintpath-condition-raw-greater-than-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild conditions (a raw `>` inside a quoted attribute value is valid XML); MSBuild — a <Reference> with a HintPath names an assembly by file"
---

## Rule

A `>` inside a quoted attribute value ends no tag. A `<HintPath>` child element whose `Condition` holds a raw `>` is read, so the assembly its file name gives is referenced, as it is with the `&gt;` spelling.

## Files

```xml path=fuzz/ApiFuzz/ApiFuzz.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <Reference Include="Api">
      <HintPath Condition="'$(LangVersion)' > '10'">Acme.Api.dll</HintPath>
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

- fuzz/ApiFuzz/Program.cs:4 -> node:Acme.Api      # the HintPath under the condition names the assembly Acme.Api builds

## Why

The child element was found only when its start tag held no `>` before the end, so a condition with a raw `>` hid the path and the reference named no project.
