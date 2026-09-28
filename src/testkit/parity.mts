/**
 * Parity, both ways, between a tool's command table, its hand-written usage text and its MCP tools: names, and for the tools also each field's type, which fields are required, and the order of the arguments. The table is the one source; the check proves that the usage text and the tools say the same thing as it, so a command, an argument or a flag added in one place and forgotten in another fails a test instead of shipping.
 */
import { argSpec, publicCommands, type CommandTable } from '../cli/table.mjs';
import { readUsage, type UsageOptions } from '../cli/usage.mjs';

export type { UsageOptions } from '../cli/usage.mjs';
import { buildTools, toolFlags, toolName, prefixOf, type McpTool, type ToolOptions } from '../mcp/tools.mjs';

export interface ParityOptions {
  table: CommandTable;
  /** The usage text; left out, the usage side is not checked. */
  usage?: string;
  usageOptions?: UsageOptions;
  /** Check that each command's usage entries mention exactly its flags. Default true. */
  usageFlags?: boolean;
  /** Flags a usage entry need not mention (global ones documented once, say). Default the table's global flags. */
  usageFlagsOptional?: readonly string[];
  /** The tools the server lists (`tools/list`); left out, the tool side is not checked. */
  tools?: readonly Pick<McpTool, 'name' | 'inputSchema'>[];
  /** The options the tools were built with (prefix, omitted flags, help). */
  toolOptions?: ToolOptions;
  /** Tool names that stand for no command. Default the help tool when `toolOptions.help` is set. */
  extraTools?: readonly string[];
}

/** Every disagreement between the table and the usage text or the tools; empty means parity. */
export function parityProblems(options: ParityOptions): string[] {
  const { table } = options;
  const p: string[] = [];
  const commands = publicCommands(table);

  if (options.tools) {
    const toolOpts = options.toolOptions ?? {};
    const prefix = prefixOf(table, toolOpts);
    const extra = new Set(options.extraTools ?? (toolOpts.help !== undefined ? [toolName(prefix, 'help')] : []));
    const byName = new Map(options.tools.map((t) => [t.name, t]));
    const reference = new Map(buildTools(table, toolOpts).map((t) => [t.name, t]));
    const expected = new Set<string>();
    for (const c of commands) {
      const name = toolName(prefix, c);
      expected.add(name);
      const t = byName.get(name);
      if (!t) { p.push(`command "${c}" has no tool ${name}`); continue; }
      const want = [...(table.commands[c]?.args ?? []).map((a) => argSpec(a).name), ...Object.keys(toolFlags(table, c, toolOpts))].sort();
      const have = Object.keys(t.inputSchema?.properties ?? {}).sort();
      const missing = want.filter((f) => !have.includes(f));
      const surplus = have.filter((f) => !want.includes(f));
      if (missing.length) p.push(`tool ${name} lacks ${missing.map((f) => `"${f}"`).join(', ')}`);
      if (surplus.length) p.push(`tool ${name} has ${surplus.map((f) => `"${f}"`).join(', ')}, which command "${c}" does not take`);
      // Beyond the names: each field's type (and item type), which fields are required, and the arguments in the table's order.
      const ref = reference.get(name);
      if (!ref) continue;
      const props = (t.inputSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
      const refProps = ref.inputSchema.properties;
      for (const f of want) {
        if (!props[f] || !refProps[f]) continue;
        const shape = (x: Record<string, unknown>): string => JSON.stringify([x.type, (x.items as Record<string, unknown> | undefined)?.type ?? null]);
        if (shape(props[f]) !== shape(refProps[f])) p.push(`tool ${name}: "${f}" is ${shape(props[f])}, the table makes it ${shape(refProps[f])}`);
      }
      const req = [...((t.inputSchema as { required?: string[] })?.required ?? [])].sort();
      const refReq = [...(ref.inputSchema.required ?? [])].sort();
      if (JSON.stringify(req) !== JSON.stringify(refReq)) p.push(`tool ${name} requires [${req.join(', ')}], the table [${refReq.join(', ')}]`);
      const argNames = (table.commands[c]?.args ?? []).map((a) => argSpec(a).name);
      const order = Object.keys(props).filter((f) => argNames.includes(f));
      if (order.length === argNames.length && JSON.stringify(order) !== JSON.stringify(argNames)) p.push(`tool ${name} lists its arguments as ${order.join(', ')}, the table as ${argNames.join(', ')}`);
    }
    for (const name of byName.keys()) if (!expected.has(name) && !extra.has(name)) p.push(`tool ${name} stands for no command of the table`);
    for (const name of extra) if (!byName.has(name)) p.push(`tool ${name} is expected but not listed`);
  }

  if (options.usage !== undefined) {
    const { blocks, unknown } = readUsage(options.usage, table, options.usageOptions);
    for (const syn of unknown) p.push(`usage lists "${syn}", which the table does not have`);
    const optional = new Set(options.usageFlagsOptional ?? Object.keys(table.globalFlags ?? {}));
    for (const c of commands) {
      const b = blocks[c];
      if (!b) { p.push(`command "${c}" is missing from the usage text`); continue; }
      if (options.usageFlags === false) continue;
      const takes = { ...(table.globalFlags ?? {}), ...(table.commands[c]?.flags ?? {}) };
      for (const f of Object.keys(table.commands[c]?.flags ?? {})) if (!optional.has(f) && !b.flags.includes(f)) p.push(`usage of "${c}" does not mention --${f}`);
      for (const f of b.flags) if (!Object.hasOwn(takes, f)) p.push(`usage of "${c}" mentions --${f}, which it does not take`);
    }
    for (const c of Object.keys(blocks)) if (table.commands[c]?.internal) p.push(`usage lists internal command "${c}"`);
  }
  return p;
}

/** Throws listing every disagreement, for a test. */
export function assertParity(options: ParityOptions): void {
  const p = parityProblems(options);
  if (p.length) throw new Error(`the command table, the usage text and the tools disagree:\n  ${p.join('\n  ')}`);
}
