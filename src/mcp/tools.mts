/**
 * MCP tools generated from the command table: one tool per public command, `<prefix><command>` (a subcommand or a dash joins with `_`: `grain_decide_steer`), one field per argument and per flag under the flag's own name, and the annotations from the table. A call is turned back into the argv the CLI would get, so the CLI's own parser reads it exactly as it reads a command line.
 */
import { isAbsolute } from 'node:path';
import { argSpec, commandFlags, pathFields, publicCommands, type CommandSpec, type CommandTable, type FlagKind } from '../cli/table.mjs';

/** A JSON-RPC "invalid params" refusal (-32602): the call's input does not fit the tool. */
export class InvalidParams extends Error {
  readonly rpcCode = -32602;
  constructor(message: string) { super(message); this.name = 'InvalidParams'; }
}

/** Throws `InvalidParams` with `message` unless `cond` holds. */
export function requireParam(cond: unknown, message: string): asserts cond {
  if (!cond) throw new InvalidParams(message);
}

export interface McpTool {
  name: string;
  description: string;
  /** The fields: one per argument and per flag. The schema is closed in practice rather than by `additionalProperties: false`: the server refuses a field it does not list with a -32602 error naming the fields it takes, so the keyword would cost every tool its bytes in `tools/list` to say what the refusal already says. */
  inputSchema: { type: 'object'; properties: Record<string, Record<string, unknown>>; required?: string[] };
  /**
   * The MCP tool annotations, written only where they differ from the specification's defaults (`readOnlyHint` false, `destructiveHint` true, `idempotentHint` false, `openWorldHint` true), so an absent hint means its default. A read-only tool says `readOnlyHint: true` and nothing about destruction or idempotence, which the specification gives meaning only for a tool that writes; a tool that writes says `destructiveHint: false` unless the table marks it destructive and `idempotentHint: true` when the table marks it idempotent. Every tool says `openWorldHint: false`: it works on local files, not an open world.
   */
  annotations: { readOnlyHint?: true; destructiveHint?: false; idempotentHint?: true; openWorldHint: false };
}

export interface ToolOptions {
  /** Tool name prefix. Default `<tool>_`. */
  prefix?: string;
  /** A tool's description. Default: `WRITES.` or `Read-only.`, then the command's summary. */
  describe?: (command: string, spec: CommandSpec) => string;
  /** Text added to one field's description. */
  fieldNote?: (command: string, field: string) => string | undefined;
  /** Global flags no tool offers. Default `['help']`: a tool has no use for the CLI's help flag. */
  omitFlags?: readonly string[];
  /** When given, a `<prefix>help` tool answering with this text (the usage), so short tool descriptions can leave the details to it. */
  help?: string;
}

/** The note a path field carries: the one description the adapter writes itself. */
const ABS = 'An absolute path.';
const DEFAULT_OMIT: readonly string[] = ['help'];

/** A tool's name for a command. */
export function toolName(prefix: string, command: string): string {
  return prefix + command.replace(/[ -]/g, '_');
}

export const prefixOf = (table: CommandTable, options: ToolOptions = {}): string => options.prefix ?? `${table.tool}_`;

/** The fields a command's tool takes, by kind: its arguments, then its flags and the global flags not omitted. */
export function toolFlags(table: CommandTable, command: string, options: ToolOptions = {}): Record<string, FlagKind> {
  const omit = new Set(options.omitFlags ?? DEFAULT_OMIT);
  return Object.fromEntries(Object.entries(commandFlags(table, command)).filter(([f]) => !omit.has(f)));
}

/** The command a tool name stands for, or null (the help tool included). */
export function commandForTool(table: CommandTable, name: unknown, options: ToolOptions = {}): string | null {
  if (typeof name !== 'string') return null;
  const prefix = prefixOf(table, options);
  return publicCommands(table).find((c) => toolName(prefix, c) === name) ?? null;
}

// A field's schema says only what its name and type do not: a flag's name is the field's name, its kind is the type (an array for a repeatable flag, a number for a number flag), and an argument's position and whether it is required are the table's business (argv order) and `required`'s. Only a path field carries a word, because "absolute" is a rule the type cannot say. Everything else a caller needs is in the help tool, said once instead of once per tool.
function flagSchema(kind: FlagKind): Record<string, unknown> {
  switch (kind) {
    case 'bool': return { type: 'boolean' };
    case 'many': return { type: 'array', items: { type: 'string' } };
    case 'number': return { type: ['number', 'string'] };
    default: return { type: 'string' };
  }
}

function annotationsFor(spec: CommandSpec): McpTool['annotations'] {
  if (!spec.writes) return { readOnlyHint: true, openWorldHint: false };
  return { ...(spec.destructive ? {} : { destructiveHint: false as const }), ...(spec.idempotent ? { idempotentHint: true as const } : {}), openWorldHint: false };
}

function defaultDescription(_command: string, spec: CommandSpec): string {
  return [spec.writes ? 'WRITES.' : 'Read-only.', spec.summary ?? ''].filter(Boolean).join(' ');
}

/** The tools for every public command of the table, and the help tool when `help` is given. */
export function buildTools(table: CommandTable, options: ToolOptions = {}): McpTool[] {
  const prefix = prefixOf(table, options);
  const describe = options.describe ?? defaultDescription;
  const tools: McpTool[] = [];
  for (const command of publicCommands(table)) {
    const spec = table.commands[command] as CommandSpec;
    const paths = pathFields(table, command);
    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];
    for (const a of (spec.args ?? []).map(argSpec)) {
      properties[a.name] = a.variadic ? { type: 'array', items: { type: 'string' }, ...(a.optional ? {} : { minItems: 1 }) } : { type: 'string' };
      if (!a.optional) required.push(a.name);
    }
    for (const [f, kind] of Object.entries(toolFlags(table, command, options))) properties[f] = flagSchema(kind);
    for (const [f, schema] of Object.entries(properties)) {
      const words = [paths.has(f) ? ABS : undefined, options.fieldNote?.(command, f)].filter(Boolean);
      if (words.length) schema.description = words.join(' ');
    }
    tools.push({
      name: toolName(prefix, command),
      description: describe(command, spec),
      inputSchema: { type: 'object', properties, ...(required.length ? { required } : {}) },
      annotations: annotationsFor(spec),
    });
  }
  if (options.help !== undefined) {
    tools.push({
      name: toolName(prefix, 'help'),
      description: 'Read-only. The full usage text.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true, openWorldHint: false },
    });
  }
  return tools;
}

const scalar = (v: unknown): v is string | number => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

/**
 * A tool call back into the argv the CLI would be given: the command words, every flag inline (`--name=value`, so a value that starts with `--` is never read as a flag), then a bare `--` and the arguments in order. Every field is checked first; a misfit throws `InvalidParams` naming the field.
 */
export function argvFor(table: CommandTable, command: string, input: unknown, options: ToolOptions = {}): string[] {
  const tool = toolName(prefixOf(table, options), command);
  const given = input ?? {};
  requireParam(typeof given === 'object' && !Array.isArray(given), `${tool}: arguments must be an object`);
  const fields = given as Record<string, unknown>;
  const spec = table.commands[command] as CommandSpec;
  const args = (spec.args ?? []).map(argSpec);
  const flags = toolFlags(table, command, options);
  const paths = pathFields(table, command);
  const known = [...args.map((a) => a.name), ...Object.keys(flags)];
  for (const k of Object.keys(fields)) requireParam(known.includes(k), `${tool}: unknown field "${k}" — it takes ${known.join(', ') || 'no fields'}`);
  const absolute = (f: string, v: string): void => {
    if (paths.has(f)) requireParam(v.trim() !== '' && isAbsolute(v), `${tool}: "${f}" must be an absolute path (got ${JSON.stringify(v)}) — the server does not run in your working directory`);
  };

  const argv = command.split(' ');
  for (const [f, kind] of Object.entries(flags)) {
    const v = fields[f];
    if (v === undefined || v === null) continue;
    if (kind === 'bool') {
      requireParam(typeof v === 'boolean', `${tool}: "${f}" must be true or false`);
      if (v) argv.push(`--${f}`);
    } else if (kind === 'many') {
      const list = ([] as unknown[]).concat(v);
      requireParam(list.every(scalar), `${tool}: "${f}" must be a string or a list of strings`);
      for (const x of list) { absolute(f, String(x)); argv.push(`--${f}=${x}`); }
    } else if (kind === 'number') {
      requireParam((typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))), `${tool}: "${f}" must be a number`);
      argv.push(`--${f}=${v}`);
    } else {
      requireParam(scalar(v), `${tool}: "${f}" must be a string`);
      absolute(f, String(v));
      argv.push(`--${f}=${v}`);
    }
  }
  const words: string[] = [];
  let gap: string | null = null;
  for (const a of args) {
    const v = fields[a.name];
    if (v === undefined || v === null) {
      requireParam(a.optional, `${tool}: "${a.name}" is required`);
      gap = gap ?? a.name;
      continue;
    }
    requireParam(gap === null, `${tool}: "${a.name}" is given but "${gap}" before it is not — the arguments are read in order`);
    const list = a.variadic ? ([] as unknown[]).concat(v) : [v];
    requireParam(list.every(scalar), `${tool}: "${a.name}" must be ${a.variadic ? 'a list of strings' : 'a string'}`);
    requireParam(a.optional || list.length > 0, `${tool}: "${a.name}" needs at least one item`);
    for (const x of list) { absolute(a.name, String(x)); words.push(String(x)); }
  }
  if (words.length) argv.push('--', ...words);
  return argv;
}

/** Whether a call answers with a JSON document: `json: true` on a command with a `--json` flag, or a command that prints JSON unasked (unless the flag its `stdoutJson` names is given). */
export function answersJson(table: CommandTable, command: string, input: unknown): boolean {
  const spec = table.commands[command];
  if (!spec) return false;
  const fields = (input ?? {}) as Record<string, unknown>;
  if (commandFlags(table, command).json === 'bool' && fields.json === true) return true;
  if (spec.stdoutJson === true) return true;
  return typeof spec.stdoutJson === 'string' && (fields[spec.stdoutJson] === undefined || fields[spec.stdoutJson] === null);
}
