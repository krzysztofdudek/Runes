---
id: php-unresolved-outside-or-unfollowed-silence
language: php
category: trap
expectation: silence
cites: "PSR-4 autoloading; Composer autoload (a class under a prefix of the package's own map is the package's)"
---

## Rule

A class name under no prefix of the repository's Composer maps (a library installed under `vendor/`) leaves the repository: absent, `outside`. A class name under a PSR-4 prefix of the repository whose file is not there points into the repository: absent, `unfollowed`.

## Files

```json path=composer.json
{ "autoload": { "psr-4": { "App\\": "src/" } } }
```

```php path=src/Service.php
<?php
namespace App;
use Symfony\Component\Console\Command\Command;
use App\Generated\Proxy;
class Service {}
```

## Expect

- silence      # nothing binds another file
- src/Service.php:3 answers absent outside
- src/Service.php:4 answers absent unfollowed

## Why

`App\Generated\Proxy` sits under the repository's own prefix `App\`, so a missing file there is one the readers could not follow.
