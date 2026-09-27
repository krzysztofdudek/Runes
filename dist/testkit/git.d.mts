export interface GitEnvOptions {
    name?: string;
    email?: string;
    /** Author and committer date. Default a fixed one, so commit ids repeat. */
    date?: string;
    /** More `key: value` config entries. */
    config?: Record<string, string>;
}
/**
 * The variables git reads to find a repository instead of the working directory (`git rev-parse --local-env-vars`). A test run inside a git hook (a consumer's pre-commit running its suite) inherits GIT_DIR, GIT_INDEX_FILE and the rest from the outer git, and without clearing them every git call in a temp repository would act on the outer repository instead. The list is git's own, read once, with this fallback when git cannot be asked.
 */
export declare const GIT_LOCAL_ENV_FALLBACK: readonly string[];
/** Every variable `git rev-parse --local-env-vars` names, together with the fallback list. */
export declare function gitLocalEnvVars(): string[];
/** The config every test repository gets (`core.hooksPath` is added by `gitEnv`: an empty directory). */
export declare const TEST_GIT_CONFIG: Readonly<Record<string, string>>;
/** `base` (default `process.env`) without any variable of `git rev-parse --local-env-vars` or inherited `GIT_CONFIG_*` entry, with the test config, user and system config cut off, and a fixed identity. */
export declare function gitEnv(base?: NodeJS.ProcessEnv, options?: GitEnvOptions): NodeJS.ProcessEnv;
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
export declare function makeTempRepo(options?: GitEnvOptions & {
    files?: Record<string, string>;
    prefix?: string;
    env?: NodeJS.ProcessEnv;
}): TempRepo;
