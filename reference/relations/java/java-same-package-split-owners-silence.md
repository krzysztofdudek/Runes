---
id: java-same-package-split-owners-silence
language: java
category: trap
expectation: silence
cites: "JLS SE25 §7.6 (a package may span several source roots); distinct-owner rule of the shared JVM namespace"
---

## Rule

When two owners declare the same fully-qualified name (a package split over two modules that both define `com.a.Owner`), the simple name cannot be attributed to one of them from the sources, so the use binds to neither. Files of ONE owner that declare the name (a Kotlin expect/actual pair, a Java class and its test double of one module) still bind.

## Files

```java path=moduleA/src/main/java/com/a/Owner.java owner=moduleA
package com.a;
public class Owner {}
```

```java path=moduleB/src/main/java/com/a/Owner.java owner=moduleB
package com.a;
public class Owner {}
```

```java path=moduleC/src/main/java/com/a/Use.java owner=moduleC
package com.a;
class Use {
  Owner owner;
}
```

## Expect

- silence      # two owners define com.a.Owner

## Why

Choosing one of the two would be a guess and a likely false edge.
