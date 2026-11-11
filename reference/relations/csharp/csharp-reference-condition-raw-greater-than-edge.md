---
id: csharp-reference-condition-raw-greater-than-edge
language: csharp
category: usage-site
expectation: edge
cites: "MSBuild conditions (a comparison `'$(V)' > '10'` may be written with a raw `>` inside the quoted attribute value; XML allows `>` in an attribute value)"
---

## Rule

A `>` inside a quoted attribute value ends no tag. A `<Reference>` whose `Condition` holds a raw `>` and is written before its `Include` is read whole, so the project it names by assembly name is referenced, as it is with the `&gt;` spelling or with the attributes in the other order.

## Files

```xml path=fuzz/ApiFuzz/ApiFuzz.csproj
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <Reference Condition="'$(LangVersion)' > '10'" Include="Acme.Api" />
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

- fuzz/ApiFuzz/Program.cs:4 -> node:Acme.Api      # the Include after the condition is read

## Why

The tag was read up to the first `>`, the one inside the condition, so the `Include` after it was never seen and the referenced project was answered unreachable.
