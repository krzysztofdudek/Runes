---
id: java-same-package-nested-type-shadow-silence
language: java
category: nested
expectation: silence
cites: "JLS SE25 §6.4.1 (a member or local type shadows a type of the same name in the package), §6.3"
---

## Rule

A type the file itself declares, nested or local, shadows a type of the package with the same simple name. `Holder` declares a member `Owner` and a method declares a local `Owner`: the mentions of `Owner` in this file mean those, not `com.a.Owner`. The extractor emits no same-package candidate for any simple name the file declares anywhere (which only ever silences more than strictly needed).

## Files

```java path=src/main/java/com/a/Owner.java owner=a
package com.a;
public class Owner {}
```

```java path=src/main/java/com/a/Holder.java owner=holder
package com.a;
class Holder {
  static class Owner {}
  Owner member;
  void m() {
    class Owner {}
    Owner local = new Owner();
  }
}
```

## Expect

- silence      # both Owner types are declared in this file

## Why

The member type is the closest binding; reporting the package's `Owner` would be a false edge.
