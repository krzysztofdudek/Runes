/**
 * The four rules of the guard, applied to one file's tokens. Comments and prose never matter: a lexical ban on words is unworkable (relation code says `node` hundreds of times for syntax nodes), so every rule reads code shape: an import specifier, the arguments of a process call, a string literal, an exported name.
 */
import { type Token } from './tokenize.mjs';
import { type GuardConfig, type DomainTerm } from './config.mjs';
export type GuardRule = 'import' | 'spawn' | 'state-path' | 'export-word';
export interface GuardFinding {
    /** Path as given to the scanner (the runner passes it relative to the scanned root, with forward slashes). */
    file: string;
    line: number;
    rule: GuardRule;
    /** What matched: the import specifier, the command word, the state directory, or the exported identifier. */
    subject: string;
    /** The tool reached, or the domain word carried. */
    target: string;
    message: string;
}
export interface ExportedName {
    name: string;
    line: number;
}
/** Splits an identifier into lower-case words: camelCase, PascalCase, snake_case, SCREAMING_CASE and digits all split. */
export declare function identifierWords(name: string): string[];
/** The domain terms an identifier carries, after qualifiers are applied. */
export declare function domainWordsIn(name: string, terms: DomainTerm[]): string[];
/** Module specifiers the file imports, re-exports from, dynamically imports, or requires, with their lines. */
export declare function importSpecifiers(tokens: Token[]): Array<{
    specifier: string;
    line: number;
}>;
/** Names the file exports: ESM declarations and export lists, `export * as`, and CommonJS `exports.x` / `module.exports.x` / `module.exports = { ... }`. */
export declare function listExports(source: string | Token[]): ExportedName[];
/** Applies every rule to one file's source text. */
export declare function scanSource(text: string, file: string, config?: GuardConfig): GuardFinding[];
