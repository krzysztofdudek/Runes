---
id: java-same-package-beats-on-demand-import-edge
language: java
category: trap
expectation: edge
cites: "JLS SE25 §6.4.1 (a type-import-on-demand never shadows a type of the package), §7.5.2"
---

## Rule

A type-import-on-demand is the weakest binding: a type of the same simple name that the package itself declares wins over it. In `Use` the name `Owner` means `com.a.Owner` although `import com.x.*;` offers a `com.x.Owner` too. The wildcard keeps its own edge (to the package it names, as before); the use binds to the package's `Owner`.

## Files

```java path=src/main/java/com/a/Owner.java owner=a
package com.a;
public class Owner {}
```

```java path=src/main/java/com/x/Owner.java owner=x
package com.x;
public class Owner {}
```

```java path=src/main/java/com/a/Use.java owner=use
package com.a;
import com.x.*;
class Use {
  Owner owner;
}
```

## Expect

- src/main/java/com/a/Use.java:2 -> node:x      # the wildcard's own edge, unchanged
- src/main/java/com/a/Use.java:4 -> node:a      # the use: the package's type beats the on-demand one

## Why

Resolving the bare name to the on-demand import (or to nothing) would hide the true dependency on `a`.
