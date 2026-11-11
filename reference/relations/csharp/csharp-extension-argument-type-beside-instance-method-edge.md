---
id: csharp-extension-argument-type-beside-instance-method-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.10.3 (an extension method is considered when no instance method is applicable); §12.6.4.2 (applicable function member: each argument converts implicitly to its parameter's type); §10.2 (implicit conversions: none from `string` to a struct such as `System.Guid`)"
---

## Rule

An instance method takes a call only when each argument converts to its parameter's type. `ILibraryManager` of node core declares `GetItemById(Guid)` and `GetItemById<T>(Guid)`, and node ext adds the extension `GetItemById(this ILibraryManager, string)`. `_libraryManager.GetItemById(playlistId)` passes a parameter the file declares as `string`, which no `Guid` parameter takes, so the call is the extension's. `_libraryManager.GetItemById(itemId)` on line 8 passes a `Guid`: the instance method's, and no edge.

## Files

```csharp path=src/core/ILibraryManager.cs
using System;
namespace App;
public class BaseItem { }
public interface ILibraryManager {
  BaseItem GetItemById(Guid id);
  T GetItemById<T>(Guid id) where T : BaseItem;
}
```

```csharp path=src/ext/LibraryManagerExtensions.cs
using System;
namespace App;
public static class LibraryManagerExtensions {
  public static BaseItem GetItemById(this ILibraryManager manager, string id) => manager.GetItemById(new Guid(id));
}
```

```csharp path=src/web/Playlists.cs
using System;
namespace App;
public class Playlists {
  private readonly ILibraryManager _libraryManager;
  public void Remove(string playlistId, Guid itemId) {
    var playlist = _libraryManager.GetItemById(playlistId);
    string entryId = playlistId;
    var item = _libraryManager.GetItemById(itemId) ?? _libraryManager.GetItemById(entryId);
  }
}
```

## Expect

- src/ext/LibraryManagerExtensions.cs:4 -> node:core
- src/web/Playlists.cs:4 -> node:core
- src/web/Playlists.cs:6 -> node:ext      # a string parameter: no instance method takes it
- src/web/Playlists.cs:8 -> node:ext      # the second call passes a string local; the first, a Guid, is the instance method's

## Why

Where an instance method and an extension method both took a call by its counts, the instance method was taken, and the extension edge was lost even where the file writes an argument type the instance method cannot take.
