---
id: java-same-package-single-import-wins-edge
language: java
category: trap
expectation: edge
cites: "JLS SE25 §6.4.1 (a single-type import shadows a type of the same name declared in another compilation unit of the package), §7.5.1"
---

## Rule

A single-type import shadows a type of the same simple name that another file of the package declares. `import com.b.Owner;` in a file of package `com.a` makes `Owner` mean `com.b.Owner`, although `com.a.Owner` exists. The import gives its edge to `com.b`'s owner; the later mentions of `Owner` emit no same-package candidate, so the package's own `Owner` is never bound.

## Files

```java path=src/main/java/com/a/Owner.java owner=a
package com.a;
public class Owner {}
```

```java path=src/main/java/com/b/Owner.java owner=b
package com.b;
public class Owner {}
```

```java path=src/main/java/com/a/Use.java owner=use
package com.a;
import com.b.Owner;
class Use {
  Owner owner = new Owner();
}
```

## Expect

- src/main/java/com/a/Use.java:2 -> node:b      # the import's edge; line 4 binds to nothing of its own

## Why

Binding the simple name to the package's type would turn a correct dependency on `b` into a false one on `a`.
