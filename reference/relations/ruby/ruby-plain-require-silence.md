---
id: ruby-plain-require-silence
language: ruby
category: import
expectation: silence
cites: "Ruby Kernel#require (`$LOAD_PATH` search, not file-relative) https://docs.ruby-lang.org/en/3.4/Kernel.html#method-i-require ; research PART A §A3"
---

## Rule

`require 'x'` / `require 'x/y'` is resolved against the `$LOAD_PATH` (gems, activated gem `lib/`, `-I` dirs) — NOT relative to the requiring file. The resolver looks a plain `require` up only under the repository's load-path roots (`lib/` and the `require_paths` of its gemspecs), never beside the requiring file or anywhere else, so a same-named file elsewhere in the repo is not bound and the require leaves the repository.

## Files

```ruby path=src/jsonlib/json.rb
module JSON
end
```

```ruby path=src/app/loader.rb
require 'json'
require 'order/processor'
```

## Expect

- silence      # plain `require` is load-path-resolved — the coincidental src/jsonlib/json.rb is under no load-path root, so it is not bound
- src/app/loader.rb:1 answers absent outside
- src/app/loader.rb:2 answers absent outside

## Why

Treating `require 'json'` as `./json.rb`, or as any file named `json.rb`, would fabricate an edge whenever a same-named in-repo file coincidentally exists; reading the load-path roots only closes that FP.
