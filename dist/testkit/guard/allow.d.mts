/**
 * The allow file: the reviewed list of places where the guard is knowingly silenced. One entry per line, `<path> <rule> [<subject>]`, with `#` starting a comment. The path is relative to the scanned root with forward slashes and may use `*` (within one segment) and `**` (any depth); the rule is one of the guard's rules or `*`; the subject, when given, must equal the finding's subject exactly. An entry that silences nothing is reported, so the file cannot rot into a blanket pass.
 */
import type { GuardFinding } from './scan.mjs';
export interface AllowEntry {
    path: string;
    rule: string;
    subject?: string;
    /** 1-based line in the allow file. */
    line: number;
    /** The trailing comment, if any: the reason the entry exists. */
    reason?: string;
}
/** Parses allow-file text. Throws on a line that is not a valid entry. */
export declare function parseAllow(text: string): AllowEntry[];
/** Whether an entry silences a finding. */
export declare function allowMatches(entry: AllowEntry, finding: GuardFinding): boolean;
