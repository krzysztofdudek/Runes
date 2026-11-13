---
id: java-unresolved-outside-or-unfollowed-silence
language: java
category: trap
expectation: silence
cites: "JLS SE25 §7.5 (import declarations), §7.4 (packages)"
---

## Rule

An import of a package the repository declares no type in (the JDK's `java.util`, a library's `org.junit`) leaves the repository: absent, `outside`. An import under a package of the repository that names no declared type points into the repository: absent, `unfollowed`.

## Files

```java path=src/main/java/com/acme/app/Order.java
package com.acme.app;
public class Order {}
```

```java path=src/main/java/com/acme/app/Use.java
package com.acme.app;
import java.util.ArrayList;
import org.junit.Test;
import com.acme.app.Missing;
import com.acme.app.gen.*;
class Use {}
```

## Expect

- silence      # nothing binds another owner
- src/main/java/com/acme/app/Use.java:2 answers absent outside
- src/main/java/com/acme/app/Use.java:3 answers absent outside
- src/main/java/com/acme/app/Use.java:4 answers absent unfollowed
- src/main/java/com/acme/app/Use.java:5 answers absent outside

## Why

`com.acme.app.Missing` is a type of the repository's own package that no file declares, which a consumer must report; `java.util.ArrayList` is the JDK's. A star import of a package the repository declares nothing in, `com.acme.app.gen`, reads as outside: no file of the repository says the package is its own.
