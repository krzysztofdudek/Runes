**A worker works in its own worktree, on its own branch.** Only the coordinator works in the main checkout; every worker gets a fresh worktree cut from the branch the work lands on, on a branch named for its issue (`<prefix>/NNN-slug`, NNN the first issue it carries), and never touches another worker's worktree or the main checkout's working tree.

- **One issue per commit.** Each commit carries one issue's change and names it in its message (`… (issue NNN)`). A package of small issues on one branch still commits them one by one, so a review, a revert or a bisect can take one issue at a time.
- **State lives in the main checkout.** A worktree may not see the coordinator's state at all. Every call that reads or writes it passes the main checkout's absolute path explicitly (the `root` field, or its CLI flag), from wherever the worker stands.
- **Stay in your lane.** Change only what the issue needs. Something else seen on the way is reported for filing, not fixed in passing.
- **Scratch goes to scratch.** Temporary files go to the scratch directory the brief names, never into the repository.
- **Leave it mergeable.** The repository's own check passes on the branch before the work is reported; the branch is not pushed, merged or rebased onto others unless the brief says so. The coordinator merges, then removes the worktree and the branch.
