---
id: java-same-package-test-to-main-edge
language: java
category: usage-site
expectation: edge
cites: "JLS SE25 §6.4.1, §7.6 (a type of the package is in scope by its simple name in every file of the package); Maven Standard Directory Layout (src/main/java, src/test/java)"
---

## Rule

A test in the package of the class it tests names that class by its simple name and needs no import. `OwnerTest` in `src/test/java/com/a` uses `Owner` of `src/main/java/com/a`: the two roots are siblings and the package is the same, so the use is a dependency of the test's owner on the main owner. The extractor emits the candidate `com.a.Owner` at each simple type name in a type position and at each capitalised receiver; the resolver finds the one file that declares it in the shared JVM namespace and attributes the edge to its owner. One line that names the type twice (`Owner owner = new Owner()`) is one edge.

## Files

```java path=src/main/java/com/a/Owner.java owner=main
package com.a;
public class Owner {}
```

```java path=src/test/java/com/a/OwnerTest.java owner=tests
package com.a;
class OwnerTest {
  Owner owner = new Owner();
}
```

## Expect

- src/test/java/com/a/OwnerTest.java:3 -> node:main      # the test's own package: no import, one edge for the two mentions on line 3

## Why

Without it neither Grain's proposal nor `yg check` sees that the tests depend on the production code of their own package, which is the most common dependency of a Maven or Gradle project.
