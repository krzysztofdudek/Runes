---
id: java-standard-library-name-outside-silence
language: java
category: builtin
expectation: silence
cites: "JLS SE25 §7.3 (every compilation unit imports the public types of java.lang on demand), §7.5 (import declarations), §6.4.1 (a type of the package shadows an on-demand import)"
---

## Rule

A name of the standard library binds no file of the repository, and its answer says it leaves the repository: an import under `java.`, `javax.` or `jdk.`, and a simple name of `java.lang` written without an import (`String`, `Override`, `Exception`), which Java reads through the implicit on-demand import of `java.lang` after the file's own package. A simple name the package does not declare and `java.lang` does not hold, and an import of a type of the repository's own package that no file declares, were not followed.

## Files

```java path=src/main/java/com/acme/app/Order.java
package com.acme.app;
public class Order {}
```

```java path=src/main/java/com/acme/app/Use.java
package com.acme.app;
import java.util.List;
import javax.annotation.processing.Generated;
import jdk.jfr.Event;
import com.acme.app.Missing;
class Use extends Exception {
  @Override public String toString() { return ""; }
  Gone gone;
}
```

## Expect

- silence      # nothing binds another owner
- src/main/java/com/acme/app/Use.java:2 answers absent outside
- src/main/java/com/acme/app/Use.java:3 answers absent outside
- src/main/java/com/acme/app/Use.java:4 answers absent outside
- src/main/java/com/acme/app/Use.java:5 answers absent unfollowed
- src/main/java/com/acme/app/Use.java:6 answers absent outside
- src/main/java/com/acme/app/Use.java:7 answers absent outside
- src/main/java/com/acme/app/Use.java:8 answers absent unfollowed

## Why

On a real repository most of the Java uses that bind no file are names of the standard library; read as names of the file's own package, they could not be told from a type of the repository that no file declares, which is what a consumer must report.
