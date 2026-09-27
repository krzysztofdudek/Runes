/**
 * Runs the guard over a directory tree and applies the allow file.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import * as nodePath from 'node:path';
import { join, extname, isAbsolute } from 'node:path';
import { DEFAULT_GUARD_CONFIG } from './config.mjs';
import { scanSource } from './scan.mjs';
import { parseAllow, allowMatches } from './allow.mjs';
function walk(dir, config, out) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!config.skipDirs.includes(entry.name))
                walk(full, config, out);
        }
        else if (entry.isFile() && config.extensions.includes(extname(entry.name))) {
            out.push(full);
        }
    }
}
/** A scanned file's path relative to root, with forward slashes: the form findings and allow entries use on every OS. `path` is replaceable so the Windows form can be tested on any host. */
export function relativePosix(root, full, path = nodePath) {
    return path.relative(root, full).split(path.sep).join('/');
}
/** Scans the configured directories and returns findings split by the allow file. */
export function runGuard(options) {
    const config = options.config ?? DEFAULT_GUARD_CONFIG;
    const dirs = options.dirs ?? ['src'];
    const allowPath = options.allowFile === undefined ? join(options.root, 'guard.allow') : isAbsolute(options.allowFile) ? options.allowFile : join(options.root, options.allowFile);
    const entries = existsSync(allowPath) ? parseAllow(readFileSync(allowPath, 'utf8')) : [];
    const paths = [];
    for (const d of dirs) {
        const full = join(options.root, d);
        if (!existsSync(full))
            continue;
        if (statSync(full).isDirectory())
            walk(full, config, paths);
        else
            paths.push(full);
    }
    // Sorted by the forward-slash form, so findings come out in the same order on every OS ('\\' and '/' sort differently against '.' and '-').
    const pairs = paths.map((p) => ({ p, rel: relativePosix(options.root, p) })).sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
    paths.splice(0, paths.length, ...pairs.map((x) => x.p));
    const files = pairs.map((x) => x.rel);
    const findings = [];
    const allowed = [];
    const used = new Set();
    paths.forEach((p, index) => {
        for (const f of scanSource(readFileSync(p, 'utf8'), files[index], config)) {
            const entry = entries.find((e) => allowMatches(e, f));
            if (entry) {
                used.add(entry);
                allowed.push(f);
            }
            else
                findings.push(f);
        }
    });
    return { findings, allowed, unusedAllow: entries.filter((e) => !used.has(e)), files };
}
/** Whether a report is clean: no unallowed findings and no stale allow entries. */
export function guardPassed(report) {
    return report.findings.length === 0 && report.unusedAllow.length === 0;
}
/** A readable summary of a report, for a failing test's message. */
export function formatGuardReport(report) {
    const lines = [];
    for (const f of report.findings)
        lines.push(`${f.file}:${f.line} [${f.rule}] ${f.message}`);
    for (const e of report.unusedAllow)
        lines.push(`guard.allow:${e.line} '${e.path} ${e.rule}${e.subject ? ` ${e.subject}` : ''}' silences nothing; remove it`);
    if (lines.length === 0)
        lines.push(`guard clean: ${report.files.length} files, ${report.allowed.length} allowed findings`);
    return lines.join('\n');
}
