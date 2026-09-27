export interface GitEnvOptions {
    name?: string;
    email?: string;
    /** Author and committer date. Default a fixed one, so commit ids repeat. */
    date?: string;
    /** More `key: value` config entries. */
    config?: Record<string, string>;
}
/** The config every test repository gets. */
export declare const TEST_GIT_CONFIG: Readonly<Record<string, string>>;
/** `base` (default `process.env`) with the test config appended to any `GIT_CONFIG_*` entries it already has, user and system config cut off, and a fixed identity. */
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
}): TempRepo;
