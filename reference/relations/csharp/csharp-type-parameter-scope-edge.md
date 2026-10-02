---
id: csharp-type-parameter-scope-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §7.7.1 (scopes — a type parameter's scope is its declaration's base, constraints and body, and a method's return type, parameters, constraints and body; the declaration's attributes are outside it); §7.6.1 (namespace and type names — a name with type arguments never names a type parameter)"
---

## Rule

A type parameter shadows a type of the same name only inside its own declaration. Outside it the name is an ordinary type reference: in a sibling class of the same file, in a sibling method of the generic method's class, and in the attributes on the generic declaration itself. A name written with type arguments (`Entity<int>`) never names a type parameter, so it binds the generic type even inside the scope of a type parameter of that name.

## Files

```csharp path=src/data/Repository.cs
using Shop.Core;
namespace Shop.Data;
public class Repository<Entity> {
  public Entity Last;
  public Entity<int> Keyed;
}
public class Audit {
  public Entity Subject;
}
public class Service {
  public T Make<T>() => default(T);
  public T Current;
}
[Marker(typeof(Entity))]
public class Box<Entity> {}
```

```csharp path=src/core/Types.cs
namespace Shop.Core;
public class Entity {}
public class Entity<TKey> {}
public class T {}
```

## Expect

- src/data/Repository.cs:5 -> node:core      # `Entity<int>` names the generic type Shop.Core.Entity<TKey>, never the type parameter
- src/data/Repository.cs:8 -> node:core      # `Entity` outside Repository<Entity> binds Shop.Core.Entity
- src/data/Repository.cs:12 -> node:core     # `T` outside Make<T> binds Shop.Core.T
- src/data/Repository.cs:14 -> node:core     # the attribute on Box<Entity> is outside the type parameter's scope

## Why

Shadowing has to follow the type parameter's scope. Silencing the name file-wide, or for every form of the name, would hide real dependencies of the same file.
