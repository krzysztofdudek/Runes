---
id: csharp-type-parameter-sibling-receiver-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §7.7.1 (scopes — a type parameter's scope is its declaration's base, constraints and body); §12.8.7 (member access through a type name)"
---

## Rule

A type parameter named like a type of the repository shadows that type only inside its own generic declaration. In a sibling class of the same file, a member access `Entity.Create()` through the name is a static call through the type `Entity`, and it binds the repository's type of that name. Inside the declaration, the same receiver names the type parameter and binds nothing.

## Files

```csharp path=src/data/Repository.cs
using Shop.Core;
namespace Shop.Data;
public class Repository<Entity> {
  public Entity Make() => default(Entity);
  public object Inside() => Entity.Create();
}
public class Factory {
  public object Build() => Entity.Create();
}
```

```csharp path=src/entity/Entity.cs
namespace Shop.Core;
public class Entity { public static Entity Create() => new Entity(); }
```

## Expect

- src/data/Repository.cs:8 -> node:entity     # Factory is outside Repository<Entity>: Entity.Create() binds Shop.Core.Entity

## Why

Muting the parameter name for the whole file, as the file-wide declared-name set did, hid a real static call in a sibling class. The silence inside the declaration is the case csharp-type-parameter-shadows-type-silence already fixes for types.
