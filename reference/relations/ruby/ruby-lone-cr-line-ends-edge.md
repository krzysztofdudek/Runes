---
id: ruby-lone-cr-line-ends-edge
language: ruby
category: trap
expectation: edge
cites: "Ruby parser, parse.y (a CR that no LF follows is read as a space, with a warning); research 2026-11-15 readers gaps, lone CR lines"
---

## Rule

Ruby reads a lone CR as a space, so a file with old Mac line ends is valid Ruby where its statements are separated by semicolons, as here; an editor still shows it on as many lines as it has line ends. Tree-sitter counts rows by LF alone, so in a file whose lines end with a lone CR every node sits on row 0; the line a use reports is the line an editor shows, counted by LF, CRLF and lone CR alike, so that a message points at the line of the use and a waiver written on that line matches it.

## Files

```ruby path=src/services/order_service.rb
class OrderService
end
```

```ruby path=src/orders/order.rb eol=cr
x = 1;

require_relative '../services/order_service'
```

## Expect

- src/orders/order.rb:3 -> node:services      # the require on the third line as an editor shows it reports line 3, never line 1

## Why

At v1.1.0 the line was the tree-sitter row plus one, and the whole file is row 0, so the use was reported on line 1. Ruby itself counts lines by LF alone; the line reported here is the editor's, where a person reads the message and writes a waiver.
