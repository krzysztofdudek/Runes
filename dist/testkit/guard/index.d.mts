/**
 * The family guard (vision design §3.2): code shipped by one tool does not import another tool's code, does not run another tool's executable, and does not build a path into another tool's state directory, unless that pair is a declared edge. Runes adds one more rule for its own entry: no exported identifier carries a family domain word.
 */
export { tokenize, type Token, type TokenType } from './tokenize.mjs';
export { FAMILY_TOOLS, DEFAULT_DOMAIN_WORDS, DEFAULT_GUARD_CONFIG, guardConfig, type GuardConfig, type GuardTool, type DomainTerm } from './config.mjs';
export { scanSource, listExports, importSpecifiers, identifierWords, domainWordsIn, type GuardFinding, type GuardRule, type ExportedName } from './scan.mjs';
export { parseAllow, allowMatches, type AllowEntry } from './allow.mjs';
export { runGuard, guardPassed, formatGuardReport, type GuardOptions, type GuardReport } from './run.mjs';
