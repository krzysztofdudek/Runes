---
id: csharp-alias-qualified-attribute-silence
language: csharp
category: usage-site
expectation: silence
cites: "C# spec §7.8 (namespace alias qualifier: an `extern alias` names an external assembly's root namespace), §22.3 (attribute names); Runes issue 181"
---

## Rule

An attribute written after an `extern alias` (`[Lib::Audited]`, `[Lib::Cache<int>]`) names a type of another assembly, which a source-only reading cannot see: it binds nothing, whatever the repository declares under the same name in the enclosing or the global namespace.

## Files

```csharp path=src/web/Handler.cs
extern alias Lib;
namespace Shop.Web;
[Lib::Audited]
[Lib::Cache<int>]
class Handler { }
```

```csharp path=src/decoy/Decoys.cs
namespace Shop.Web { public class AuditedAttribute : System.Attribute { } public class Cache<T> : System.Attribute { } }
```

```csharp path=src/global/Globals.cs
public class AuditedAttribute : System.Attribute { }
public class Cache<T> : System.Attribute { }
```

## Expect

silence

## Why

An extern alias is never a namespace of the repository, so reading `Lib::Audited` as `Audited` would bind a same-named attribute the author did not mean.
