---
id: csharp-type-parameter-shadows-type-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §7.6.1 (namespace and type names — a simple name with no type arguments inside a generic declaration names its type parameter first); §7.7.1 (scopes — a type parameter's scope is its declaration's base, constraints and body, and a method's return type, parameters, constraints and body); §12.8.4 (simple names)"
---

## Rule

Inside a generic class, struct, record, interface, method, local function or delegate, a bare name that equals one of its type parameters names that type parameter, in every type position: a field, property, return or parameter type, a constraint, `typeof`, `default`, a cast, `is`, `as`, `new T[n]`, and a type argument of a generic type or a generic method call (`GetRequiredService<T>()`). It names no type of the repository, even when an imported namespace declares a type of the same name.

## Files

```csharp path=src/core/Types.cs
namespace Shop.Core;
public class Entity {}
public class T {}
public class TResult {}
public class TKey {}
public class TItem {}
```

```csharp path=src/data/Repository.cs
using System.Collections.Generic;
using Shop.Core;
namespace Shop.Data;
public class Repository<Entity> where Entity : class {
  private Entity _last;
  private List<Entity> _all = new List<Entity>();
  public Entity Find(Entity probe) => (Entity)probe ?? default(Entity);
  public bool Holds(object o) => o is Entity || o as Entity != null;
  public System.Type Kind => typeof(Entity);
  public Entity[] Page(int n) => new Entity[n];
  public T Resolve<T>(System.IServiceProvider sp) where T : class => sp.GetRequiredService<T>();
  public TResult Map<TResult>(System.Func<Entity, TResult> f) => f(_last);
}
public interface IStore<TKey> { TKey Next(); }
public delegate TResult Projection<TItem, TResult>(TItem item);
public record Envelope<TItem>(TItem Body);
public static class Local {
  public static void Run() { TItem Id<TItem>(TItem x) => x; }
}
```

## Expect

- silence      # every `Entity`, `T`, `TResult`, `TKey` and `TItem` above names a type parameter in scope, not Shop.Core's type

## Why

A type parameter named like a domain type (`Repository<Entity>`) or a generic helper (`Resolve<T>() => sp.GetRequiredService<T>()`) would otherwise bind the repository's type of that name under a `using`, a false edge the gate cannot be told to ignore. The same names outside the generic declaration still bind (csharp-type-parameter-scope-edge).
