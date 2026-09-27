/**
 * A git environment for tests that is the same on every machine: no user or system config (hooks, signing, templates, autocrlf), a fixed identity and dates, and no background work (`maintenance.auto=false`, `gc.auto=0`), which otherwise starts detached processes that hold files a test wants to delete (fatal on Windows) and slow a suite down. Settings travel as `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`, so every git process a test starts, directly or through the code under test, gets them.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface GitEnvOptions {
  name?: string;
  email?: string;
  /** Author and committer date. Default a fixed one, so commit ids repeat. */
  date?: string;
  /** More `key: value` config entries. */
  config?: Record<string, string>;
}

// Git for Windows maps the literal /dev/null to its null device in every file it opens, so one spelling works on every platform, where os.devNull (\\.\nul) would reach git as an odd path.
const NULL_FILE = '/dev/null';

/** The config every test repository gets. */
export const TEST_GIT_CONFIG: Readonly<Record<string, string>> = Object.freeze({
  'maintenance.auto': 'false',
  'gc.auto': '0',
  'init.defaultBranch': 'main',
  'commit.gpgsign': 'false',
  'tag.gpgsign': 'false',
  'core.autocrlf': 'false',
  'core.hooksPath': NULL_FILE,
});

/** `base` (default `process.env`) with the test config appended to any `GIT_CONFIG_*` entries it already has, user and system config cut off, and a fixed identity. */
export function gitEnv(base: NodeJS.ProcessEnv = process.env, options: GitEnvOptions = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  const name = options.name ?? 'Runes Test';
  const email = options.email ?? 'test@example.com';
  const date = options.date ?? '2026-01-01T00:00:00Z';
  const entries = { ...TEST_GIT_CONFIG, 'user.name': name, 'user.email': email, ...(options.config ?? {}) };
  let n = Number(env.GIT_CONFIG_COUNT) || 0;
  for (const [k, v] of Object.entries(entries)) {
    env[`GIT_CONFIG_KEY_${n}`] = k;
    env[`GIT_CONFIG_VALUE_${n}`] = v;
    n += 1;
  }
  env.GIT_CONFIG_COUNT = String(n);
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: NULL_FILE,
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

export interface TempRepo {
  /** The repository's directory, with symbolic links resolved. */
  dir: string;
  env: NodeJS.ProcessEnv;
  /** Runs git in the repository; returns stdout. */
  git(...args: string[]): string;
  /** Writes a file (directories created), path relative to the repository. */
  write(path: string, content: string): void;
  /** Stages everything and commits; returns the new commit id. */
  commit(message: string): string;
  /** Removes the repository. */
  cleanup(): void;
}

/** A fresh repository under the OS temp dir, with `gitEnv`. `files` are written and committed as a first commit when given. */
export function makeTempRepo(options: GitEnvOptions & { files?: Record<string, string>; prefix?: string } = {}): TempRepo {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), options.prefix ?? 'runes-repo-')));
  const env = gitEnv(process.env, options);
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).toString();
  const write = (path: string, content: string): void => {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  };
  git('init', '-q');
  const repo: TempRepo = {
    dir, env, git, write,
    commit: (message) => { git('add', '-A'); git('commit', '-q', '--allow-empty', '-m', message); return git('rev-parse', 'HEAD').trim(); },
    cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  };
  if (options.files) {
    for (const [p, c] of Object.entries(options.files)) write(p, c);
    repo.commit('initial');
  }
  return repo;
}
