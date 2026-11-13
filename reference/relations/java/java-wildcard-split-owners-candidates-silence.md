---
id: java-wildcard-split-owners-candidates-silence
language: java
category: trap
expectation: silence
cites: "JLS SE25 §7.5.2 (type-import-on-demand); distinct-owner rule of the shared JVM namespace"
---

## Rule

An on-demand import of a package whose types two owners declare binds neither owner: the package has no single owner. The answer is ambiguous, and it names the files that declare the package's types, sorted, so a consumer whose owners are finer than a package can judge each.

## Files

```java path=app/src/main/java/com/acme/app/Order.java owner=app
package com.acme.app;
public class Order {}
```

```java path=other/src/main/java/com/acme/app/Clock.java owner=other
package com.acme.app;
public class Clock {}
```

```java path=use/src/main/java/com/acme/use/Use.java owner=use
package com.acme.use;
import com.acme.app.*;
class Use {}
```

## Expect

- silence      # the package com.acme.app has two owners
- use/src/main/java/com/acme/use/Use.java:2 answers ambiguous app/src/main/java/com/acme/app/Order.java, other/src/main/java/com/acme/app/Clock.java

## Why

Without the files a consumer whose owners are types, not packages, cannot tell whether the import reaches only types it allows.
