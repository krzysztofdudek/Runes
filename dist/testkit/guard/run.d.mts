import { type GuardConfig } from './config.mjs';
import { type GuardFinding } from './scan.mjs';
import { type AllowEntry } from './allow.mjs';
export interface GuardOptions {
    /** Repository root; file paths in findings and in the allow file are relative to it. */
    root: string;
    /** Directories (relative to root) to scan. Default: `['src']`. */
    dirs?: string[];
    /** Allow file, relative to root or absolute. Default: `guard.allow`. A missing file means no entries. */
    allowFile?: string;
    config?: GuardConfig;
}
export interface GuardReport {
    /** Findings no allow entry silences. The guard passes only when this is empty. */
    findings: GuardFinding[];
    /** Findings silenced by an allow entry. */
    allowed: GuardFinding[];
    /** Allow entries that silenced nothing. Treated as failures: a stale entry is a hole waiting to be used. */
    unusedAllow: AllowEntry[];
    /** Files scanned, relative to root. */
    files: string[];
}
/** Scans the configured directories and returns findings split by the allow file. */
export declare function runGuard(options: GuardOptions): GuardReport;
/** Whether a report is clean: no unallowed findings and no stale allow entries. */
export declare function guardPassed(report: GuardReport): boolean;
/** A readable summary of a report, for a failing test's message. */
export declare function formatGuardReport(report: GuardReport): string;
