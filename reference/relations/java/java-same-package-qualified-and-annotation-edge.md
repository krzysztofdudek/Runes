---
id: java-same-package-qualified-and-annotation-edge
language: java
category: usage-site
expectation: edge
cites: "JLS SE25 §6.5.2, §6.5.5.2, §9.7 (a qualified name begins with a simple name in scope; an annotation names a type)"
---

## Rule

The leftmost simple name of a qualified type (`Owner.Inner`), of a member access (`Owner.LIMIT`, `Owner.make()`), of a method reference (`Owner::make`) and the name of an annotation (`@Mark`) are same-package references like any other. A lowercase leading segment (`com.app.X`, `java.util.Map`) is a package, never a type, and gives no candidate; the member after the dot (`Entry` of `Map.Entry`) is not a package type either.

## Files

```java path=src/main/java/com/a/Owner.java owner=a
package com.a;
public class Owner {
  public static final int LIMIT = 1;
  public static class Inner {}
  public static Owner make() { return null; }
}
```

```java path=src/main/java/com/a/Mark.java owner=marks
package com.a;
public @interface Mark {}
```

```java path=src/test/java/com/a/UseTest.java owner=tests
package com.a;
@Mark
class UseTest {
  java.util.Map.Entry<String, String> entry;
  Owner.Inner inner;
  int limit = Owner.LIMIT;
  Object made = Owner.make();
  java.util.function.Supplier<Owner> s = Owner::make;
}
```

## Expect

- src/test/java/com/a/UseTest.java:2 -> node:marks      # @Mark: an annotation type of the package
- src/test/java/com/a/UseTest.java:5 -> node:a      # Owner.Inner
- src/test/java/com/a/UseTest.java:6 -> node:a      # Owner.LIMIT
- src/test/java/com/a/UseTest.java:7 -> node:a      # Owner.make()
- src/test/java/com/a/UseTest.java:8 -> node:a      # Supplier<Owner> and Owner::make

## Why

These are the forms in which a test names the class it tests besides a plain declaration; the java.util forms on line 4 must stay silent.
