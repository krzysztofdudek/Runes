---
id: csharp-file-type-receiver-inherited-instance-method-silence
language: csharp
category: trap
expectation: silence
cites: "C# 11 file-local types (a `file` type is a type like any other inside its file: it inherits the members of its base class); C# spec §12.8.10.3 (an extension method is considered when no instance method is applicable)"
---

## Rule

A value whose written type is a `file` type of the same file has the instance methods that type inherits. `file class Rush : Order` inherits `Validate()` from `Order`, so `r.Validate()` on a `Rush` is that method and no call of the extension `Validate(this object)` of node ext.

## Files

```csharp path=src/core/Order.cs
namespace App;
public class Order { public bool Validate() => true; }
```

```csharp path=src/ext/Checks.cs
namespace App;
public static class Checks { public static bool Validate(this object o) => false; }
```

```csharp path=src/core/Rush.cs
namespace App;
file class Rush : Order { }
public class Desk {
  bool Check(Rush r) => r.Validate();
}
```

## Expect

- silence      # src/core/Rush.cs:4 is Order's own Validate

## Why

The written type of the receiver named a type the file keeps to itself, which no key names, so the receiver was read as of no known type and the extension method took the call.
