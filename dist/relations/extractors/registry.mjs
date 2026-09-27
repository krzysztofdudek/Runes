import { typescriptExtractor } from './typescript.mjs';
import { pythonExtractor } from './python.mjs';
import { goExtractor } from './go.mjs';
import { javaExtractor } from './java.mjs';
import { phpExtractor } from './php.mjs';
import { kotlinExtractor } from './kotlin.mjs';
import { rustExtractor } from './rust.mjs';
import { cExtractor } from './c.mjs';
import { cppExtractor } from './cpp.mjs';
import { csharpExtractor } from './csharp.mjs';
import { rubyExtractor } from './ruby.mjs';
const EXTRACTORS = [
    typescriptExtractor, // TS / TSX / JS (Phase 1)
    pythonExtractor, // Python (Phase 2)
    goExtractor, // Go (Phase 3)
    javaExtractor, // Java (Phase 4)
    phpExtractor, // PHP (Phase 5)
    kotlinExtractor, // Kotlin (Phase 6) — resolves via the shared SymbolTable, not a path mapping
    rustExtractor, // Rust (Phase 7) — resolves via the crate module tree (crate::/super::/self::)
    cExtractor, // C (.c/.h) — resolves via quoted #include path relative to the includer
    cppExtractor, // C++ (.cpp/.hpp/.cc/.cxx/.hh/.hxx) — same quoted-#include resolver as C
    csharpExtractor, // C# (.cs) — namespace-spanning SymbolTable: using-scope + qualified/bare symbol use → FQN
    rubyExtractor, // Ruby (.rb) — require_relative PATH + constant SymbolTable; mostly silent (reopening → ambiguous)
];
const byLanguage = new Map();
for (const e of EXTRACTORS)
    for (const lang of e.languages)
        byLanguage.set(lang, e);
export function extractorForLanguage(language) {
    return byLanguage.get(language);
}
