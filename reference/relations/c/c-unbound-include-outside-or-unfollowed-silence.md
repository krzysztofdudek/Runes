---
id: c-unbound-include-outside-or-unfollowed-silence
language: c
category: builtin
expectation: silence
cites: "C23 §6.10.3 (source file inclusion: a quoted name is searched for first in an implementation-defined place, normally the includer's directory, and then as an angle name; an angle name is searched for in the implementation-defined places of headers)"
---

## Rule

An include that binds no file says where it points. An angle include of a header no place of the repository holds (`<stdio.h>`) leaves the repository: absent, `outside`. A quoted include with no file (`"missing.h"`) names a header beside the includer or under the repository's roots that is not there: absent, `unfollowed`. Without a compilation database an angle include is never bound, and where the repository holds its name at the root, under an `include/` directory or beside the includer (`<config/limits.h>`), it is the repository's header a build's `-I` list would name: `unfollowed`.

## Files

```c path=src/core/config/limits.h
#define LIMIT 8
```

```c path=include/config/limits.h
#define LIMIT 8
```

```c path=src/core/main.c
#include <stdio.h>
#include "missing.h"
#include <config/limits.h>
int main(void) { return 0; }
```

## Expect

- silence      # nothing binds another owner
- src/core/main.c:1 answers absent outside
- src/core/main.c:2 answers absent unfollowed
- src/core/main.c:3 answers absent unfollowed

## Why

`#include <stdio.h>` and a local header that is missing read the same to a consumer that sees only a bare absent answer; one leaves the repository and must stay quiet, the other is a use the readers could not follow and must be reported.
