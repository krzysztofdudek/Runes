/** Parses allow-file text. Throws on a line that is not a valid entry. */
export function parseAllow(text) {
    const entries = [];
    text.split(/\r?\n/).forEach((raw, index) => {
        const hash = raw.indexOf('#');
        const body = (hash === -1 ? raw : raw.slice(0, hash)).trim();
        const reason = hash === -1 ? undefined : raw.slice(hash + 1).trim() || undefined;
        if (!body)
            return;
        const parts = body.split(/\s+/);
        if (parts.length < 2 || parts.length > 3)
            throw new Error(`allow file line ${index + 1}: expected '<path> <rule> [<subject>]', got '${body}'`);
        const entry = { path: parts[0], rule: parts[1], line: index + 1 };
        if (parts[2] !== undefined)
            entry.subject = parts[2];
        if (reason !== undefined)
            entry.reason = reason;
        entries.push(entry);
    });
    return entries;
}
function globToRegExp(glob) {
    let re = '';
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === '*' && glob[i + 1] === '*') {
            re += '.*';
            i++;
            if (glob[i + 1] === '/')
                i++;
        }
        else if (c === '*')
            re += '[^/]*';
        else
            re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`^${re}$`);
}
/** Whether an entry silences a finding. */
export function allowMatches(entry, finding) {
    if (entry.rule !== '*' && entry.rule !== finding.rule)
        return false;
    if (entry.subject !== undefined && entry.subject !== finding.subject)
        return false;
    return globToRegExp(entry.path).test(finding.file);
}
