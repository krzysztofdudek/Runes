/**
 * A small lexer for JavaScript and TypeScript source, sufficient for the guard: it drops comments, keeps string and template text, and tells a regular expression from a division well enough that a slash never swallows real code. It is not a parser; the guard reads token patterns, never a syntax tree, which keeps Runes free of runtime dependencies.
 */
export type TokenType = 'ident' | 'string' | 'template' | 'regex' | 'number' | 'punct';
export interface Token {
    type: TokenType;
    /** Identifier name, punctuator text, or the cooked-enough text of a string or template chunk (escapes resolved for the common cases). */
    value: string;
    /** 1-based line of the token's first character. */
    line: number;
}
/** Splits source text into tokens, dropping whitespace and comments. */
export declare function tokenize(text: string): Token[];
