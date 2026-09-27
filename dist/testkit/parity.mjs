/**
 * Parity, both ways, between a tool's command table, its hand-written usage text and its MCP tools. The table is the one source; the check proves that the usage text and the tools say the same thing as it, so a command, an argument or a flag added in one place and forgotten in another fails a test instead of shipping.
 */
import { argSpec, publicCommands, readUsage } from '../cli/index.mjs';
import { toolFlags, toolName, prefixOf } from '../mcp/index.mjs';
/** Every disagreement between the table and the usage text or the tools; empty means parity. */
export function parityProblems(options) {
    const { table } = options;
    const p = [];
    const commands = publicCommands(table);
    if (options.tools) {
        const toolOpts = options.toolOptions ?? {};
        const prefix = prefixOf(table, toolOpts);
        const extra = new Set(options.extraTools ?? (toolOpts.help !== undefined ? [toolName(prefix, 'help')] : []));
        const byName = new Map(options.tools.map((t) => [t.name, t]));
        const expected = new Set();
        for (const c of commands) {
            const name = toolName(prefix, c);
            expected.add(name);
            const t = byName.get(name);
            if (!t) {
                p.push(`command "${c}" has no tool ${name}`);
                continue;
            }
            const want = [...(table.commands[c]?.args ?? []).map((a) => argSpec(a).name), ...Object.keys(toolFlags(table, c, toolOpts))].sort();
            const have = Object.keys(t.inputSchema?.properties ?? {}).sort();
            const missing = want.filter((f) => !have.includes(f));
            const surplus = have.filter((f) => !want.includes(f));
            if (missing.length)
                p.push(`tool ${name} lacks ${missing.map((f) => `"${f}"`).join(', ')}`);
            if (surplus.length)
                p.push(`tool ${name} has ${surplus.map((f) => `"${f}"`).join(', ')}, which command "${c}" does not take`);
        }
        for (const name of byName.keys())
            if (!expected.has(name) && !extra.has(name))
                p.push(`tool ${name} stands for no command of the table`);
        for (const name of extra)
            if (!byName.has(name))
                p.push(`tool ${name} is expected but not listed`);
    }
    if (options.usage !== undefined) {
        const { blocks, unknown } = readUsage(options.usage, table, options.usageOptions);
        for (const syn of unknown)
            p.push(`usage lists "${syn}", which the table does not have`);
        const optional = new Set(options.usageFlagsOptional ?? Object.keys(table.globalFlags ?? {}));
        for (const c of commands) {
            const b = blocks[c];
            if (!b) {
                p.push(`command "${c}" is missing from the usage text`);
                continue;
            }
            if (options.usageFlags === false)
                continue;
            const takes = { ...(table.globalFlags ?? {}), ...(table.commands[c]?.flags ?? {}) };
            for (const f of Object.keys(table.commands[c]?.flags ?? {}))
                if (!optional.has(f) && !b.flags.includes(f))
                    p.push(`usage of "${c}" does not mention --${f}`);
            for (const f of b.flags)
                if (!Object.hasOwn(takes, f))
                    p.push(`usage of "${c}" mentions --${f}, which it does not take`);
        }
        for (const c of Object.keys(blocks))
            if (table.commands[c]?.internal)
                p.push(`usage lists internal command "${c}"`);
    }
    return p;
}
/** Throws listing every disagreement, for a test. */
export function assertParity(options) {
    const p = parityProblems(options);
    if (p.length)
        throw new Error(`the command table, the usage text and the tools disagree:\n  ${p.join('\n  ')}`);
}
