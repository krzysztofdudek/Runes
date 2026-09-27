**Call the tool through its MCP tools first, when the session has them.** A tool with an MCP server offers every command of its CLI as an MCP tool named after the tool and the command (`<tool>_<command>`, a subcommand joined with `_`); the server may start by itself (installed as a plugin) or be configured by hand. The tools are generated from the same command table as the CLI and run the same code, with the same checks, so they are not a second implementation and a tool's answer is the CLI's answer. A tool's description starts by saying whether it writes; when the server also offers a help tool, it prints the full usage text.

- A flag is the field of the same name without the dashes; a flag that takes no value is `true`; a repeatable flag is a list, one item per repetition.
- An argument is the field its usage names, in the usage's order. An argument in brackets may be left out, but not one that comes before another you give.
- The server does not run in your working directory, so a field naming a file or directory the command would look up from there must be an absolute path; a relative one is refused.
- `json: true` answers with the JSON document `--json` prints, as exactly one text block; notes ride in `_meta`.
- Input that does not fit the tool is refused before anything runs (a JSON-RPC -32602 error naming the field). A refusal or a failed check comes back with `isError: true`; where the tool answers a refusal with an error document (`<tool>-error/1`), read its `code`, never its wording.
- A call that runs past the server's time limit, where it sets one, is stopped with everything it started, and the answer says so and how to allow longer.

**The CLI is the fallback.** When a session has no such tools (a host without MCP, a subagent given none, a server that is not installed or not running), run the same command through the CLI, with the same effect; its help prints the usage.
