---
id: java-qualified-member-not-in-outer-file-unfollowed-edge
language: java
category: nested
expectation: edge
cites: "JLS SE25 §6.5.5.2 (a qualified type name `Q.Id`), §8.5 (member types are inherited)"
---

## Rule

A use written `Outer.Member`, where `Outer` is a type of the file's own package, names a member type of a type of the repository. When the file of `Outer` does not declare the member (it inherits it, or a code generator such as Lombok writes it), the use binds no file and stays the repository's: absent, `unfollowed`, never `outside`.

## Files

```java path=src/main/java/com/acme/app/Base.java owner=base
package com.acme.app;
public class Base { public static class Inner {} }
```

```java path=src/main/java/com/acme/app/Sub.java owner=sub
package com.acme.app;
public class Sub extends Base {}
```

```java path=src/main/java/com/acme/app/Person.java owner=person
package com.acme.app;
@lombok.Builder
public class Person {}
```

```java path=src/main/java/com/acme/app/Use.java owner=use
package com.acme.app;
class Use {
  Sub.Inner inner;
  Person.PersonBuilder builder;
}
```

## Expect

- src/main/java/com/acme/app/Sub.java:2 -> node:base
- src/main/java/com/acme/app/Use.java:3 -> node:sub
- src/main/java/com/acme/app/Use.java:4 -> node:person
- src/main/java/com/acme/app/Use.java:3 answers resolved src/main/java/com/acme/app/Sub.java
- src/main/java/com/acme/app/Use.java:3 answers absent unfollowed
- src/main/java/com/acme/app/Use.java:4 answers resolved src/main/java/com/acme/app/Person.java
- src/main/java/com/acme/app/Use.java:4 answers absent unfollowed

## Why

The written name as a whole looked like a dotted name from elsewhere, so the use read as outside although its first name is a type of the repository.
