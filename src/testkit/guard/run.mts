/**
 * Runs the guard over a directory tree and applies the allow file.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep, extname, isAbsolute } from 'node:path';
import { DEFAULT_GUARD_CONFIG, type GuardConfig } from './config.mjs';
import { scanSource, type GuardFinding } from './scan.mjs';
import { parseAllow, allowMatches, type AllowEntry } from './allow.mjs';

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

function walk(dir: string, config: GuardConfig, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!config.skipDirs.includes(entry.name)) walk(full, config, out);
    } else if (entry.isFile() && config.extensions.includes(extname(entry.name))) {
      out.push(full);
    }
  }
}

/** Scans the configured directories and returns findings split by the allow file. */
export function runGuard(options: GuardOptions): GuardReport {
  const config = options.config ?? DEFAULT_GUARD_CONFIG;
  const dirs = options.dirs ?? ['src'];
  const allowPath = options.allowFile === undefined ? join(options.root, 'guard.allow') : isAbsolute(options.allowFile) ? options.allowFile : join(options.root, options.allowFile);
  const entries = existsSync(allowPath) ? parseAllow(readFileSync(allowPath, 'utf8')) : [];

  const paths: string[] = [];
  for (const d of dirs) {
    const full = join(options.root, d);
    if (!existsSync(full)) continue;
    if (statSync(full).isDirectory()) walk(full, config, paths);
    else paths.push(full);
  }
  paths.sort();

  const files = paths.map((p) => relative(options.root, p).split(sep).join('/'));
  const findings: GuardFinding[] = [];
  const allowed: GuardFinding[] = [];
  const used = new Set<AllowEntry>();
  paths.forEach((p, index) => {
    for (const f of scanSource(readFileSync(p, 'utf8'), files[index]!, config)) {
      const entry = entries.find((e) => allowMatches(e, f));
      if (entry) {
        used.add(entry);
        allowed.push(f);
      } else findings.push(f);
    }
  });
  return { findings, allowed, unusedAllow: entries.filter((e) => !used.has(e)), files };
}

/** Whether a report is clean: no unallowed findings and no stale allow entries. */
export function guardPassed(report: GuardReport): boolean {
  return report.findings.length === 0 && report.unusedAllow.length === 0;
}

/** A readable summary of a report, for a failing test's message. */
export function formatGuardReport(report: GuardReport): string {
  const lines: string[] = [];
  for (const f of report.findings) lines.push(`${f.file}:${f.line} [${f.rule}] ${f.message}`);
  for (const e of report.unusedAllow) lines.push(`guard.allow:${e.line} '${e.path} ${e.rule}${e.subject ? ` ${e.subject}` : ''}' silences nothing; remove it`);
  if (lines.length === 0) lines.push(`guard clean: ${report.files.length} files, ${report.allowed.length} allowed findings`);
  return lines.join('\n');
}
