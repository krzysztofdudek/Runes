**Call the tool through its MCP tools first.** Installed as a plugin, the tool starts its MCP server by itself, and every command of its CLI is an MCP tool named after the tool and the command (`<tool>_<command>`, a subcommand joined with `_`), plus `<tool>_help`, which prints the usage text. The tools are generated from the same command table as the CLI and run the same code, with the same checks, so they are not a second implementation. A tool's description starts by saying whether it writes.

- A flag is the field of the same name without the dashes; a flag that takes no value is `true`; a repeatable flag is a list, one item per repetition.
- An argument is the field its usage names, in the usage's order. An argument in brackets may be left out, but not one that comes before another you give.
- A field that names a file or directory must be an absolute path: the server does not run in your working directory, and a relative one is refused.
- `json: true` answers with the JSON document `--json` prints, as exactly one text block; notes ride in `_meta`. A refusal in JSON is the `<tool>-error/1` document: read its `code`, never its wording.
- Input that does not fit the tool is refused before anything runs (a JSON-RPC -32602 error naming the field). A refusal or a failed check comes back with `isError: true`.
- A call that runs too long is stopped with everything it started, and the answer says how to allow longer.

**The CLI is the fallback.** When a session has no such tools (a host without MCP, a subagent given none, a copy of the skill outside the plugin), run the same command through the CLI, with the same effect. Write flags before a bare `--` and a value that starts with `--` after it; a flag the command does not take is refused, never ignored.
