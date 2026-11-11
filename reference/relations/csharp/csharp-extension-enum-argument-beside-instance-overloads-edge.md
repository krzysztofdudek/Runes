---
id: csharp-extension-enum-argument-beside-instance-overloads-edge
language: csharp
category: usage-site
expectation: edge
cites: "C# spec §12.8.10.3 (an extension method is considered when no instance method is applicable); §12.6.4.2 (applicable function member); §10.2 (implicit conversions: an enum value converts to no class and to no other struct)"
---

## Rule

A member of an enum has the enum's type, and an enum value converts to no class of the repository and to no struct such as `System.DateTime`. `IImageProcessor` of node core declares five `GetImageCacheTag` overloads of two parameters, none of which takes an `ImageType` second; node ext adds the extension `GetImageCacheTag(this IImageProcessor, BaseItem, ImageType)`. `_imageProcessor.GetImageCacheTag(item, ImageType.Primary)` is therefore the extension's. `_imageProcessor.GetImageCacheTag(item, info)` on line 7 passes an `ItemImageInfo`, which an instance overload takes: no edge.

## Files

```csharp path=src/core/IImageProcessor.cs
using System;
namespace App;
public class BaseItem { }
public class BaseItemDto { }
public class ChapterInfo { }
public class ItemImageInfo { }
public enum ImageType { Primary, Backdrop }
public interface IImageProcessor {
  string GetImageCacheTag(string baseItemPath, DateTime imageDateModified);
  string GetImageCacheTag(BaseItemDto item, ChapterInfo image);
  string GetImageCacheTag(BaseItem item, ItemImageInfo image);
  string GetImageCacheTag(BaseItemDto item, ItemImageInfo image);
  string GetImageCacheTag(BaseItem item, ChapterInfo chapter);
}
```

```csharp path=src/ext/ImageProcessorExtensions.cs
namespace App;
public static class ImageProcessorExtensions {
  public static string GetImageCacheTag(this IImageProcessor processor, BaseItem item, ImageType imageType) => "";
}
```

```csharp path=src/web/Search.cs
namespace App;
public class Search {
  private readonly IImageProcessor _imageProcessor;
  public string Tags(BaseItem item, ItemImageInfo info) {
    var primary = _imageProcessor.GetImageCacheTag(item, ImageType.Primary);
    var kind = ImageType.Backdrop;
    return primary + _imageProcessor.GetImageCacheTag(item, info) + _imageProcessor.GetImageCacheTag(item, kind);
  }
}
```

## Expect

- src/ext/ImageProcessorExtensions.cs:3 -> node:core
- src/web/Search.cs:3 -> node:core
- src/web/Search.cs:4 -> node:core
- src/web/Search.cs:5 -> node:ext       # an enum member as the second argument: no instance overload takes it; and node core for ImageType
- src/web/Search.cs:5 -> node:core
- src/web/Search.cs:6 -> node:core

## Why

Counts cannot tell overloads apart: five instance overloads take two arguments, so the instance method was taken and the extension edge was lost. Line 7 gives no edge to node ext: its first call passes an `ItemImageInfo`, and its second a `var` local, whose type the file does not write.
