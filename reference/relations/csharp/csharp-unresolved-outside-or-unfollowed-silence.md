---
id: csharp-unresolved-outside-or-unfollowed-silence
language: csharp
category: trap
expectation: silence
cites: "C# spec §7.6 (namespace and type names), §14.5 (using directives)"
---

## Rule

A name the repository does not declare, which only a namespace the repository declares nothing in can give it (`System.Text` through its using), leaves the repository: absent, `outside`. A name read only in namespaces of the repository that binds nothing points into the repository: absent, `unfollowed`.

## Files

```csharp path=src/text/Builder.cs
using System.Text;
namespace Shop.Text;
class Builder { StringBuilder sb; }
```

```csharp path=src/app/Use.cs
namespace Shop.App;
class Use { Missing m; Shop.Core.Gone g; }
```

```csharp path=src/core/Order.cs
namespace Shop.Core;
public class Order {}
```

## Expect

- silence      # nothing binds another owner
- src/text/Builder.cs:3 answers absent outside
- src/app/Use.cs:2 answers absent unfollowed

## Why

`StringBuilder` can come only from `System.Text`, which no file of the repository declares; `Missing` and `Shop.Core.Gone` can only be the repository's own.
