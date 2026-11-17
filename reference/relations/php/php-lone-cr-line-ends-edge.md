---
id: php-lone-cr-line-ends-edge
language: php
category: trap
expectation: edge
cites: "PHP Zend language scanner (its NEWLINE is a CR, an LF or a CR LF); research 2026-11-15 readers gaps, lone CR lines"
---

## Rule

PHP counts a lone CR as a new line, as an editor shows it, so a file with old Mac line ends has as many lines as an editor shows. Tree-sitter counts rows by LF alone, so in a file whose lines end with a lone CR every node sits on row 0; the line a use reports is the line an editor shows, counted by LF, CRLF and lone CR alike, so that a message points at the line of the use and a waiver written on that line matches it.

## Files

```php path=src/Enums/Suit.php
<?php
namespace App\Enums;
enum Suit { case Hearts; case Spades; }
```

```php path=src/Order/Handler.php eol=cr
<?php
namespace App\Order;

use App\Enums\Suit;
class Handler {}
```

```json path=composer.json
{ "autoload": { "psr-4": { "App\\": "src/" } } }
```

## Expect

- src/Order/Handler.php:4 -> node:Enums      # the `use` on the fourth line reports line 4, never line 1

## Why

At v1.1.0 the line was the tree-sitter row plus one, and the whole file is row 0, so the use was reported on line 1.
