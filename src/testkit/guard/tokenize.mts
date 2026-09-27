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

const REGEX_AFTER_WORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
]);
const PUNCT3 = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??='];
const PUNCT2 = ['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];

function isIdentStart(c: string): boolean {
  return /[A-Za-z_$\u0080-￿]/.test(c);
}

function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_$\u0080-￿]/.test(c);
}

const SIMPLE_ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };

/** Splits source text into tokens, dropping whitespace and comments. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  // Each entry is either a plain brace or the `${` that opened a template substitution, so the matching `}` knows whether to resume the template.
  const braces: Array<'brace' | 'template'> = [];
  let i = 0;
  let line = 1;
  const n = text.length;

  const last = (): Token | undefined => tokens[tokens.length - 1];

  const regexAllowed = (): boolean => {
    const prev = last();
    if (!prev) return true;
    if (prev.type === 'ident') return REGEX_AFTER_WORDS.has(prev.value);
    if (prev.type === 'punct') return prev.value !== ')' && prev.value !== ']' && prev.value !== '++' && prev.value !== '--';
    return false;
  };

  // Reads template characters from i (just after a backtick or a closing substitution brace) up to the closing backtick or the next `${`.
  const readTemplateChunk = (): void => {
    const startLine = line;
    let value = '';
    while (i < n) {
      const c = text[i]!;
      if (c === '\\') {
        const e = text[i + 1] ?? '';
        value += SIMPLE_ESCAPES[e] ?? e;
        if (e === '\n') line++;
        i += 2;
        continue;
      }
      if (c === '`') {
        i++;
        tokens.push({ type: 'template', value, line: startLine });
        return;
      }
      if (c === '$' && text[i + 1] === '{') {
        i += 2;
        tokens.push({ type: 'template', value, line: startLine });
        braces.push('template');
        return;
      }
      if (c === '\n') line++;
      value += c;
      i++;
    }
    tokens.push({ type: 'template', value, line: startLine });
  };

  while (i < n) {
    const c = text[i]!;
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '﻿') { i++; continue; }
    if (c === '#' && i === 0 && text[1] === '!') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const startLine = line;
      let value = '';
      i++;
      while (i < n && text[i] !== c && text[i] !== '\n') {
        if (text[i] === '\\') {
          const e = text[i + 1] ?? '';
          value += SIMPLE_ESCAPES[e] ?? e;
          if (e === '\n') line++;
          i += 2;
          continue;
        }
        value += text[i];
        i++;
      }
      i++;
      tokens.push({ type: 'string', value, line: startLine });
      continue;
    }
    if (c === '`') {
      i++;
      readTemplateChunk();
      continue;
    }
    if (c === '}' && braces[braces.length - 1] === 'template') {
      braces.pop();
      i++;
      readTemplateChunk();
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      while (i < n && isIdentPart(text[i]!)) i++;
      tokens.push({ type: 'ident', value: text.slice(start, i), line });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
      const start = i;
      while (i < n && /[0-9A-Za-z_.]/.test(text[i]!)) i++;
      tokens.push({ type: 'number', value: text.slice(start, i), line });
      continue;
    }
    if (c === '/' && regexAllowed()) {
      const startLine = line;
      const start = i;
      i++;
      let inClass = false;
      while (i < n && text[i] !== '\n') {
        const r = text[i]!;
        if (r === '\\') { i += 2; continue; }
        if (r === '[') inClass = true;
        else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) break;
        i++;
      }
      i++;
      while (i < n && isIdentPart(text[i]!)) i++;
      tokens.push({ type: 'regex', value: text.slice(start, i), line: startLine });
      continue;
    }
    if (c === '{') braces.push('brace');
    if (c === '}') braces.pop();
    const p = PUNCT3.find((s) => text.startsWith(s, i)) ?? PUNCT2.find((s) => text.startsWith(s, i)) ?? c;
    tokens.push({ type: 'punct', value: p, line });
    i += p.length;
  }
  return tokens;
}
