---
id: java-same-package-static-import-wins-edge
language: java
category: trap
expectation: edge
cites: "JLS SE25 §6.4.1, §7.5.3 (a single-static-import declaration imports every accessible static member of that name, member types included)"
---

## Rule

`import static com.b.Consts.Owner;` imports a static member named `Owner` of `Consts`, a nested type among them, and shadows a type of the package of that name. The static import gives its edge to the owner of `Consts`, and the mentions of `Owner` emit no same-package candidate, so the package's own `Owner` is not bound.

## Files

```java path=src/main/java/com/a/Owner.java owner=a
package com.a;
public class Owner {}
```

```java path=src/main/java/com/b/Consts.java owner=b
package com.b;
public class Consts {
  public static class Owner {}
}
```

```java path=src/main/java/com/a/Use.java owner=use
package com.a;
import static com.b.Consts.Owner;
class Use {
  Owner owner;
}
```

## Expect

- src/main/java/com/a/Use.java:2 -> node:b      # the static import; line 4 binds to nothing of its own

## Why

The same simple name arrives through the import, so the package's type is the wrong binding.
