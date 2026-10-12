---
id: java-same-package-type-parameter-silence
language: java
category: trap
expectation: silence
cites: "JLS SE25 §6.4.1 (a type parameter shadows a type of the same name), §6.3"
---

## Rule

A type parameter in scope shadows a type of the package with the same name. `class Box<Owner>` and `<Owner> Owner pick(Owner o)` use `Owner` as the type parameter, never as `com.a.Owner`, so none of those mentions is a dependency. A class parameter covers the whole class, a method parameter that method.

## Files

```java path=src/main/java/com/a/Owner.java owner=a
package com.a;
public class Owner {}
```

```java path=src/main/java/com/a/Box.java owner=box
package com.a;
class Box<Owner> {
  Owner value;
  <Owner> Owner pick(Owner o) { return o; }
}
```

## Expect

- silence      # every Owner here is a type parameter

## Why

A type parameter named like a type of the package is legal and not rare in generic code; binding it would invent a dependency.
