**Evidence is what ran and what it printed.** A piece of work counts as done only with evidence a reader can check, recorded as pairs:

- `--ran "<command>"`: the exact command, as it can be run again, with where it ran (the repository or worktree, the commit or branch) when that is not obvious.
- `--saw "<what it printed>"`: the observed result, quoted or counted from the output (`tests 138, pass 138, fail 0`, the line that proves the point), never a verdict such as "works" or "all good".

One pair per check; repeat the pair for more, and `--ran` and `--saw` pair up by position. A free-text note may explain, but it never proves: the work is proven by the pairs alone, and nothing written before the work started counts. A fix to a bug carries a pair showing the check failing without the fix and passing with it. Evidence is appended, never replaced; a later run that disagrees is recorded next to the earlier one, not over it.
