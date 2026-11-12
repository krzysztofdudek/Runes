---
id: csharp-csproj-using-item-condition-raw-greater-than-edge
language: csharp
category: import
expectation: edge
cites: "MSBuild conditions (a comparison `'$(V)' > '10'` may be written with a raw `>` inside the quoted attribute value; XML allows `>` in an attribute value); MSBuild — the Using item"
---

## Rule

A `>` inside a quoted attribute value ends no tag. A `<Using>` item whose `Condition` holds a raw `>` and is written before its `Include` is read whole, so its namespace is a global using of the project, as it is with the `&gt;` spelling or with the attributes in the other order.

## Files

```xml path=src/Web/Web.csproj
<Project Sdk="Microsoft.NET.Sdk.Web">
  <ItemGroup>
    <Using Condition="'$(LangVersion)' > '10'" Include="App.Core" />
  </ItemGroup>
</Project>
```

```csharp path=src/Web/Api.cs
namespace App.Web;
public class Api {
  Order _o;
}
```

```csharp path=src/Core/Order.cs
namespace App.Core;
public class Order { }
```

## Expect

- src/Web/Api.cs:3 -> node:Core      # `Order` qualifies through the project's `<Using Include="App.Core" />`

## Why

The tag was read up to the first `>`, the one inside the condition, so the `Include` after it was never seen and the global using was lost.
