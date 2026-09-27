/**
 * Parity, both ways, between a tool's command table, its hand-written usage text and its MCP tools. The table is the one source; the check proves that the usage text and the tools say the same thing as it, so a command, an argument or a flag added in one place and forgotten in another fails a test instead of shipping.
 */
import { type CommandTable, type UsageOptions } from '../cli/index.mjs';
import { type McpTool, type ToolOptions } from '../mcp/index.mjs';
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
export declare function parityProblems(options: ParityOptions): string[];
/** Throws listing every disagreement, for a test. */
export declare function assertParity(options: ParityOptions): void;
