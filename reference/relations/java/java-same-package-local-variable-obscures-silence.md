---
id: java-same-package-local-variable-obscures-silence
language: java
category: trap
expectation: silence
cites: "JLS SE25 §6.4.2 (a variable obscures a type of the same name), §6.5.2"
---

## Rule

A capitalised receiver is a type name only when no variable of that name is in scope: a variable obscures a type (JLS §6.4.2). `String Owner = "x"; Owner.length()` calls a method on the variable, never a static member of `com.a.Owner`. The extractor silences a capitalised receiver when the file binds a variable of that name anywhere (a local, a parameter, a field, a pattern or lambda binding), reading the file as a whole, which only silences more.

## Files

```java path=src/main/java/com/a/Owner.java owner=a
package com.a;
public class Owner {}
```

```java path=src/main/java/com/a/Use.java owner=use
package com.a;
class Use {
  int len(String Owner) {
    return Owner.length();
  }
}
```

## Expect

- silence      # Owner.length() is a call on the parameter named Owner

## Why

Binding the receiver would report a dependency on `a` that the code does not have.
