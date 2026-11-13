---
id: ruby-reopening-ambiguity-candidates-silence
language: ruby
category: trap
expectation: silence
cites: "Ruby: a class opened in two files is one constant; distinct-owner rule of the symbol axis"
---

## Rule

A constant that files of two owners define binds neither owner. The answer is ambiguous and names the defining files, sorted.

## Files

```ruby path=src/y/widget.rb
class Widget
end
```

```ruby path=src/x/widget.rb
class Widget
end
```

```ruby path=src/z/use.rb
x = Widget
```

## Expect

- silence      # `Widget` is defined in the owners x and y
- src/z/use.rb:1 answers ambiguous src/x/widget.rb, src/y/widget.rb

## Why

Ruby gives the answer the other languages give for a name declared in several owners.
