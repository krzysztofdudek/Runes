---
id: csharp-enclosing-nested-enum-receiver-silence
language: csharp
category: nested
expectation: silence
cites: "C# spec §12.8.4 (simple names: a nested type of an enclosing type is a member found before any namespace member)"
---

## Rule

Inside `Order`, `Status.Paid` reads the nested enum `Order.Status`, not the global static class `Status` of node codes. The receiver of a member access reads the nested types of the enclosing types first, as a type position does.

## Files

```csharp path=src/core/Order.cs
namespace App.Core;
public class Order {
  public enum Status { New, Paid }
  public Status S = Status.Paid;
}
```

```csharp path=src/codes/Status.cs
public static class Status { public static int Paid = 1; }
```

## Expect

- silence      # Status binds Order+Status in node core, as a field type and as a receiver

## Why

A nested enum of status values beside a global or shared `Status` type is a usual layout.
