/**
 * A git environment for tests that is the same on every machine and in every caller: none of git's repository-locating variables inherited from an outer git (a hook), no user or system config (hooks, signing, templates, autocrlf), a fixed identity and dates, and no background work (`maintenance.auto=false`, `gc.auto=0`), which otherwise starts detached processes that hold files a test wants to delete (fatal on Windows) and slow a suite down. Settings travel as `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`, so every git process a test starts, directly or through the code under test, gets them.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
/**
 * The variables git reads to find a repository instead of the working directory (`git rev-parse --local-env-vars`). A test run inside a git hook (a consumer's pre-commit running its suite) inherits GIT_DIR, GIT_INDEX_FILE and the rest from the outer git, and without clearing them every git call in a temp repository would act on the outer repository instead. The list is git's own, read once, with this fallback when git cannot be asked.
 */
export const GIT_LOCAL_ENV_FALLBACK = Object.freeze([
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_OBJECT_DIRECTORY', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_IMPLICIT_WORK_TREE',
    'GIT_GRAFT_FILE', 'GIT_INDEX_FILE', 'GIT_NO_REPLACE_OBJECTS', 'GIT_REPLACE_REF_BASE', 'GIT_PREFIX', 'GIT_SHALLOW_FILE', 'GIT_COMMON_DIR',
]);
let localVars = null;
/** Every variable `git rev-parse --local-env-vars` names, together with the fallback list. */
export function gitLocalEnvVars() {
    if (localVars)
        return localVars;
    let listed = [];
    try {
        // Asked with the local variables already cleared, so an outer GIT_DIR cannot make the question itself fail.
        const clean = { ...process.env };
        for (const k of GIT_LOCAL_ENV_FALLBACK)
            delete clean[k];
        listed = execFileSync('git', ['rev-parse', '--local-env-vars'], { env: clean, cwd: tmpdir(), stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString().split(/\r?\n/).filter(Boolean);
    }
    catch { /* git missing: the fallback list */ }
    localVars = [...new Set([...GIT_LOCAL_ENV_FALLBACK, ...listed])];
    return localVars;
}
// An empty file for the global config and an empty directory for hooks, in a private temp directory made once per process. A real empty file and directory work on every platform, where /dev/null or os.devNull as a config path does not.
let nullPaths = null;
function emptyPaths() {
    if (nullPaths && existsSync(nullPaths.config) && existsSync(nullPaths.hooks))
        return nullPaths;
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'runes-gitenv-')));
    const config = join(dir, 'gitconfig');
    const hooks = join(dir, 'hooks');
    writeFileSync(config, '');
    mkdirSync(hooks);
    process.once('exit', () => { try {
        rmSync(dir, { recursive: true, force: true });
    }
    catch { /* best effort */ } });
    nullPaths = { config, hooks };
    return nullPaths;
}
/** The config every test repository gets (`core.hooksPath` is added by `gitEnv`: an empty directory). */
export const TEST_GIT_CONFIG = Object.freeze({
    'maintenance.auto': 'false',
    'gc.auto': '0',
    'init.defaultBranch': 'main',
    'commit.gpgsign': 'false',
    'tag.gpgsign': 'false',
    'core.autocrlf': 'false',
});
/** `base` (default `process.env`) without any variable of `git rev-parse --local-env-vars` or inherited `GIT_CONFIG_*` entry, with the test config, user and system config cut off, and a fixed identity. */
export function gitEnv(base = process.env, options = {}) {
    const env = { ...base };
    // Every repository-locating variable goes, GIT_CONFIG_COUNT and GIT_CONFIG_PARAMETERS (an outer `git -c`) included, with the numbered entries the count stood for; extra config goes through `options.config`.
    for (const k of gitLocalEnvVars())
        delete env[k];
    for (const k of Object.keys(env))
        if (/^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(k))
            delete env[k];
    const empty = emptyPaths();
    const name = options.name ?? 'Runes Test';
    const email = options.email ?? 'test@example.com';
    const date = options.date ?? '2026-01-01T00:00:00Z';
    const entries = { ...TEST_GIT_CONFIG, 'core.hooksPath': empty.hooks, 'user.name': name, 'user.email': email, ...(options.config ?? {}) };
    let n = 0;
    for (const [k, v] of Object.entries(entries)) {
        env[`GIT_CONFIG_KEY_${n}`] = k;
        env[`GIT_CONFIG_VALUE_${n}`] = v;
        n += 1;
    }
    env.GIT_CONFIG_COUNT = String(n);
    Object.assign(env, {
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: empty.config,
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: name,
        GIT_COMMITTER_EMAIL: email,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
        GIT_TERMINAL_PROMPT: '0',
    });
    return env;
}
/** A fresh repository under the OS temp dir, with `gitEnv`. `files` are written and committed as a first commit when given. */
export function makeTempRepo(options = {}) {
    // realpathSync.native: the canonical path git itself reports (macOS /private, Windows long names instead of 8.3 short ones such as RUNNER~1).
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), options.prefix ?? 'runes-repo-')));
    const env = gitEnv(options.env ?? process.env, options);
    const git = (...args) => execFileSync('git', args, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).toString();
    const write = (path, content) => {
        const full = join(dir, path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
    };
    git('init', '-q');
    const repo = {
        dir, env, git, write,
        commit: (message) => { git('add', '-A'); git('commit', '-q', '--allow-empty', '-m', message); return git('rev-parse', 'HEAD').trim(); },
        cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
    };
    if (options.files) {
        for (const [p, c] of Object.entries(options.files))
            write(p, c);
        repo.commit('initial');
    }
    return repo;
}
