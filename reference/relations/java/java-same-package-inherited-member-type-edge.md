---
id: java-same-package-inherited-member-type-edge
language: java
category: nested
expectation: edge
cites: "JLS SE25 §6.4.1, §8.5 (a class inherits the member types of its supertypes, and they shadow a type of the package)"
---

## Rule

Inside a class body a member type inherited from a supertype is closer than a type of the package. `Child extends Base`, `Base` declares a nested `Owner`, and the package has a top-level `Owner` too: in `Child` the name `Owner` means `Base.Owner`. The extractor offers `com.a.Base+Owner` before `com.a.Owner`, so the use binds to the owner of `Base`, not to the package's `Owner`. The `extends Base` itself is a same-package reference of its own.

## Files

```java path=src/main/java/com/a/Owner.java owner=plain
package com.a;
public class Owner {}
```

```java path=src/main/java/com/a/Base.java owner=base
package com.a;
public class Base {
  public static class Owner {}
}
```

```java path=src/main/java/com/a/Child.java owner=child
package com.a;
class Child extends Base {
  Owner owner;
}
```

## Expect

- src/main/java/com/a/Child.java:2 -> node:base      # extends Base: the same-package reference
- src/main/java/com/a/Child.java:3 -> node:base      # Owner is Base.Owner, not the package's Owner of node plain

## Why

The package's `Owner` would be a false edge to `plain`; the real dependency is on `base`.
