/**
 * How much context a server's `tools/list` costs a client, measured in CI and reported as a warning, never a failure: the size of the list is a quality resource, and so is the accuracy of tool calls, so a budget overrun is a signal to look, not a gate.
 *
 * Tokens are estimated from characters (default four per token, a common rule for English and JSON); Runes has no tokenizer and no dependency to bring one. The estimate is for comparing a server with itself over time and against its budget, not for billing.
 */
export interface ToolsMeasure {
    /** Characters of the JSON the server sends for `tools/list` (`{"tools":[...]}`). */
    chars: number;
    /** Estimated tokens. */
    tokens: number;
    budgetTokens: number;
    over: boolean;
    /** Per tool, largest first. */
    perTool: {
        name: string;
        chars: number;
        tokens: number;
    }[];
    /** A sentence to print when over budget; null otherwise. */
    warning: string | null;
}
export interface MeasureOptions {
    /** Default 8 500, the per-server target of the family's tool-description budget. */
    budgetTokens?: number;
    charsPerToken?: number;
    /** Name in the warning. */
    label?: string;
}
/** Measures a `tools/list` result (the `tools` array). */
export declare function measureTools(tools: readonly {
    name: string;
}[], options?: MeasureOptions): ToolsMeasure;
/** One line for a CI log: the size, the budget, and the warning when over. */
export declare function formatToolsMeasure(m: ToolsMeasure, label?: string): string;
