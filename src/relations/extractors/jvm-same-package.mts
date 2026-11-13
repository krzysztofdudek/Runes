import type { TargetHint } from './types.mjs';

/**
 * What the same-package binding of Java and Kotlin needs to know of one file: the same facts
 * in both languages (JLS 6.4 and 7.6; the Kotlin specification's scopes and imports), read by
 * each extractor from its own syntax tree.
 */
export interface SamePackageScope {
  /** The file's package, never empty (the unnamed package gets no scope). */
  pkg: string;
  /** Simple names of every type the file declares, nested and local ones included. */
  declared: ReadonlySet<string>;
  /** The simple name an import gives → the fully-qualified name it imports (single-type imports and aliases). */
  imports: ReadonlyMap<string, string>;
  /** Simple names an import brings that name no type to inherit through (a static import, an imported function). */
  importedOther: ReadonlySet<string>;
  /** The packages of the on-demand (star) imports. */
  onDemand: readonly string[];
}

/**
 * The ordered candidates for one simple name written without an import, in the file's package, or undefined when the name means something else there: a type the file declares, or an import that names it (that import's own hint gives the edge). The caller has already ruled out a type parameter in scope. The candidates are, in order: for each enclosing declaration whose body holds the use (innermost first) and each of its supertypes, the member type the supertype may inherit (`<Super>+<Name>`, which binds only when the supertype is in the repository and declares it), then `<package>.<Name>` through the shared JVM namespace. A package type beats an on-demand import and the default imports, as in both languages. `supertypeLists` holds, innermost first, the supertype names (simple or dotted) of each such declaration.
 */
export function samePackageGroup(scope: SamePackageScope, name: string, supertypeLists: readonly (readonly string[])[]): TargetHint[] | undefined {
  if (scope.declared.has(name) || scope.imports.has(name) || scope.importedOther.has(name)) return undefined;
  const out: TargetHint[] = [];
  const seenKeys = new Set<string>();
  const add = (symbolKey: string, samePackage: boolean): void => {
    if (seenKeys.has(symbolKey)) return;
    seenKeys.add(symbolKey);
    out.push(samePackage ? { kind: 'symbol', symbolKey, samePackage: true } : { kind: 'symbol', symbolKey });
  };
  for (const supers of supertypeLists) {
    for (const sup of supers) {
      if (sup.includes('.')) {
        add(`${sup}+${name}`, false);
        continue;
      }
      if (scope.declared.has(sup)) continue;
      const imported = scope.imports.get(sup);
      if (imported !== undefined) {
        add(`${imported}+${name}`, false);
        continue;
      }
      add(`${scope.pkg}.${sup}+${name}`, true);
      for (const p of scope.onDemand) add(`${p}.${sup}+${name}`, false);
    }
  }
  add(`${scope.pkg}.${name}`, true);
  return out;
}

/** True for a name written with a capital first letter, the form of a type name in an expression. */
export function isCapitalised(name: string): boolean {
  return /^\p{Lu}/u.test(name);
}

/** The public top-level types of `java.lang` in any JDK from 8 to 25, so a name of an older or newer one is read too. */
const JAVA_LANG_TYPES: ReadonlySet<string> = new Set(
  (
    'AbstractMethodError Appendable ArithmeticException ArrayIndexOutOfBoundsException ArrayStoreException AssertionError AutoCloseable ' +
    'Boolean BootstrapMethodError Byte Character CharSequence Class ClassCastException ClassCircularityError ClassFormatError ClassLoader ' +
    'ClassNotFoundException ClassValue CloneNotSupportedException Cloneable Comparable Compiler Deprecated Double Enum ' +
    'EnumConstantNotPresentException Error Exception ExceptionInInitializerError Float FunctionalInterface IO IllegalAccessError ' +
    'IllegalAccessException IllegalArgumentException IllegalCallerException IllegalMonitorStateException IllegalStateException ' +
    'IllegalThreadStateException IncompatibleClassChangeError IndexOutOfBoundsException InheritableThreadLocal InstantiationError ' +
    'InstantiationException Integer InternalError InterruptedException Iterable LayerInstantiationException LinkageError Long ' +
    'MatchException Math Module ModuleLayer NegativeArraySizeException NoClassDefFoundError NoSuchFieldError NoSuchFieldException ' +
    'NoSuchMethodError NoSuchMethodException NullPointerException Number NumberFormatException Object OutOfMemoryError Override ' +
    'Package Process ProcessBuilder ProcessHandle Readable Record ReflectiveOperationException Runnable Runtime RuntimeException ' +
    'RuntimePermission SafeVarargs ScopedValue SecurityException SecurityManager Short StackOverflowError StackTraceElement ' +
    'StackWalker StrictMath String StringBuffer StringBuilder StringIndexOutOfBoundsException StringTemplate SuppressWarnings System ' +
    'Thread ThreadDeath ThreadGroup ThreadLocal Throwable TypeNotPresentException UnknownError UnsatisfiedLinkError ' +
    'UnsupportedClassVersionError UnsupportedOperationException VerifyError VirtualMachineError Void WrongThreadException'
  ).split(' '),
);

/** The type names Kotlin's default imports bring into every file besides `java.lang` (the Kotlin specification's default imports: kotlin.*, kotlin.annotation.*, kotlin.collections.*, kotlin.comparisons.*, kotlin.io.*, kotlin.ranges.*, kotlin.sequences.*, kotlin.text.*, and on the JVM kotlin.jvm.*), each with its package. A name the Kotlin packages and `java.lang` both hold is Kotlin's (`kotlin.String`), as Kotlin reads `java.lang` last. */
const KOTLIN_DEFAULT_TYPES: ReadonlyMap<string, string> = new Map(
  Object.entries({
    kotlin: 'Annotation Any Array ArithmeticException AssertionError Boolean BooleanArray BuilderInference Byte ByteArray Char CharArray CharSequence ClassCastException Comparable Comparator ConcurrentModificationException ContextFunctionTypeParams Deprecated DeprecatedSinceKotlin DeprecationLevel Double DoubleArray DslMarker Enum Error Exception ExperimentalMultiplatform ExperimentalStdlibApi ExperimentalSubclassOptIn ExperimentalUnsignedTypes ExtensionFunctionType Float FloatArray Function IllegalArgumentException IllegalStateException IndexOutOfBoundsException Int IntArray KotlinNullPointerException KotlinVersion Lazy LazyThreadSafetyMode Long LongArray NoSuchElementException NoWhenBranchMatchedException NotImplementedError Nothing NullPointerException Number NumberFormatException OptIn OptionalExpectation OverloadResolutionByLambdaReturnType Pair ParameterName PublishedApi ReplaceWith RequiresOptIn Result RuntimeException Short ShortArray SinceKotlin String SubclassOptInRequired Suppress Throwable Triple TypeCastException UByte UByteArray UInt UIntArray ULong ULongArray UShort UShortArray UninitializedPropertyAccessException Unit UnsafeVariance UnsupportedOperationException',
    'kotlin.annotation': 'AnnotationRetention AnnotationTarget MustBeDocumented Repeatable Retention Target',
    'kotlin.collections': 'AbstractCollection AbstractIterator AbstractList AbstractMap AbstractMutableCollection AbstractMutableList AbstractMutableMap AbstractMutableSet AbstractSet ArrayDeque ArrayList BooleanIterator ByteIterator CharIterator Collection DoubleIterator FloatIterator Grouping HashMap HashSet IndexedValue IntIterator Iterable Iterator LinkedHashMap LinkedHashSet List ListIterator LongIterator Map MutableCollection MutableIterable MutableIterator MutableList MutableListIterator MutableMap MutableSet RandomAccess Set ShortIterator',
    'kotlin.io': 'AccessDeniedException FileAlreadyExistsException FileSystemException FileTreeWalk FileWalkDirection NoSuchFileException OnErrorAction Serializable',
    'kotlin.ranges': 'CharProgression CharRange ClosedFloatingPointRange ClosedRange IntProgression IntRange LongProgression LongRange OpenEndRange UIntProgression UIntRange ULongProgression ULongRange',
    'kotlin.sequences': 'Sequence SequenceScope',
    'kotlin.text': 'Appendable CharCategory CharDirectionality CharacterCodingException MatchGroup MatchGroupCollection MatchNamedGroupCollection MatchResult Regex RegexOption StringBuilder Typography',
    'kotlin.jvm': 'JvmDefault JvmDefaultWithCompatibility JvmDefaultWithoutCompatibility JvmField JvmInline JvmMultifileClass JvmName JvmOverloads JvmRecord JvmSerializableLambda JvmStatic JvmSuppressWildcards JvmSynthetic JvmWildcard PurelyImplements Strictfp Synchronized Throws Transient Volatile',
  }).flatMap(([pkg, names]) => names.split(' ').map((name): [string, string] => [name, pkg])),
);

/** The key a simple type name written without an import reads through the default imports of `language`, after the file's own package, or undefined when none holds it: Java's `java.lang` (JLS §7.3); Kotlin's default packages, then `java.lang`. */
export function defaultImport(language: 'java' | 'kotlin', name: string): string | undefined {
  const pkg = language === 'kotlin' ? KOTLIN_DEFAULT_TYPES.get(name) : undefined;
  if (pkg !== undefined) return `${pkg}.${name}`;
  return JAVA_LANG_TYPES.has(name) ? `java.lang.${name}` : undefined;
}
