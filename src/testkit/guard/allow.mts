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
export function parseAllow(text: string): AllowEntry[] {
  const entries: AllowEntry[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const hash = raw.indexOf('#');
    const body = (hash === -1 ? raw : raw.slice(0, hash)).trim();
    const reason = hash === -1 ? undefined : raw.slice(hash + 1).trim() || undefined;
    if (!body) return;
    const parts = body.split(/\s+/);
    if (parts.length < 2 || parts.length > 3) throw new Error(`allow file line ${index + 1}: expected '<path> <rule> [<subject>]', got '${body}'`);
    const entry: AllowEntry = { path: parts[0]!, rule: parts[1]!, line: index + 1 };
    if (parts[2] !== undefined) entry.subject = parts[2];
    if (reason !== undefined) entry.reason = reason;
    entries.push(entry);
  });
  return entries;
}

function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Whether an entry silences a finding. */
export function allowMatches(entry: AllowEntry, finding: GuardFinding): boolean {
  if (entry.rule !== '*' && entry.rule !== finding.rule) return false;
  if (entry.subject !== undefined && entry.subject !== finding.subject) return false;
  return globToRegExp(entry.path).test(finding.file);
}
