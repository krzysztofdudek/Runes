---
id: java-duplicate-fqn-candidates-silence
language: java
category: trap
expectation: silence
cites: "JLS SE25 §7.6 (a package may span several source roots); distinct-owner rule of the shared JVM namespace"
---

## Rule

A fully-qualified name that two owners declare binds neither of them. The answer is ambiguous and names the two declaring files, sorted.

## Files

```java path=svc-b/src/main/java/com/acme/shared/Config.java owner=svcb
package com.acme.shared;
public class Config {}
```

```java path=svc-a/src/main/java/com/acme/shared/Config.java owner=svca
package com.acme.shared;
public class Config {}
```

```java path=app/src/main/java/com/acme/app/Use.java owner=app
package com.acme.app;
import com.acme.shared.Config;
class Use {}
```

## Expect

- silence      # two owners declare com.acme.shared.Config
- app/src/main/java/com/acme/app/Use.java:2 answers ambiguous svc-a/src/main/java/com/acme/shared/Config.java, svc-b/src/main/java/com/acme/shared/Config.java

## Why

The candidates are sorted by path, so the answer does not depend on the order the files were read in.
