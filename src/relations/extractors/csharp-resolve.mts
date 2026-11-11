import type { SymbolTable } from '../symbol-table.mjs';
import type { TargetHint } from './types.mjs';
import { baseListKey, decodeBase, interfaceKey, memberKey, memberTypeKey, methodKey, privateMemberKey, privateMethodKey, shapeTakes } from './csharp.mjs';

type SymbolHint = Extract<TargetHint, { kind: 'symbol' }>;

/** The bases one C# type declares, over every part of it: `inside` the keys of those the repository declares, `outside` the written names of those it does not (a framework type, or a name this reader cannot bind to one type). */
export interface CsharpBases { inside: string[]; outside: string[] }

/** What the resolver reads of C# types beyond their keys: the base lists the extractor records (`baseListKey`) and what a type inherits through them. */
export interface CsharpTypeLookup {
  /** The bases of the type `typeKey`, classes and interfaces alike. */
  bases(typeKey: string): CsharpBases;
  /** The keys of the nested type `name` of `typeKey`: the type's own, or else the one its nearest base class in the repository declares (C# spec §7.6.1: the nested types of a type's base classes are its members). An interface inherits those of its base interfaces. Empty when none. */
  nested(typeKey: string, name: string): string[];
  /** What the simple name `name` is inside the type `typeKey`, where a value's name may stand: `member` when the type, in any part, declares a member of that name that is no type, or its nearest base class in the repository that knows the name declares one a derived type can see; `type` when a nested type of that name is found first (`nested`); `none` when neither the type nor a base class in the repository knows the name. */
  simpleName(typeKey: string, name: string): 'member' | 'type' | 'none';
  /** `nested` along a dotted path: `segments[0]` in `typeKey`, the next in what that gave. */
  path(typeKey: string, segments: readonly string[]): string[];
  /** Whether the type `typeKey` is an attribute class: `yes` when its base classes, followed through the repository, reach `System.Attribute`; `no` when it is an interface, or every base of it lies in the repository and none reaches `System.Attribute` (a type that lists no base among them); `maybe` when a base leaves the repository under another name, which may or may not derive from it. */
  attributeClass(typeKey: string): 'yes' | 'no' | 'maybe';
  /** True when a call `value.name(…)` with `args` arguments and `typeArgs` written type arguments, on a value of the type `typeKey`, finds an instance method it fits by those counts (`shapeTakes`): the type, in any part, or a base class or an interface of it in the repository, to any depth, declares one that is not private; with `own` (a call on `this` inside the type) a private one of the type itself counts too. */
  hasMethod(typeKey: string, call: { method: string; args: number; typeArgs: number }, own: boolean): boolean;
  /** The keys of the types the member `name` is written with, where `simpleName(typeKey, name)` answers `member` for a field or a property: the written type of each declaration of it at the level that declares it, bound where it is declared. Empty when the member writes no type of the repository. */
  memberTypes(typeKey: string, name: string): string[];
}

/** The names a base list writes `System.Attribute` by when the repository declares no type of that name in scope. */
const ATTRIBUTE_BASE_NAMES = new Set(['System.Attribute', 'Attribute']);

/**
 * Which of an attribute's two readings C# takes (spec §23.3), from what each binds: `written` and `suffixed` are the attribute-class answers of the types the written name and the `Attribute`-suffixed name bind (undefined where the reading binds no type of the repository), and `hasSuffixed` says whether the attribute has a suffixed reading at all (a written name that already ends in `Attribute` has none). A reading that binds an attribute class is the result, and both doing so is the compiler's error CS1614, which gives nothing. A type that only may be one is taken as the suffixed reading, the name the convention gives an attribute class, and as the written reading only where no suffixed reading exists; a written name without the suffix that only may be one, beside nothing suffixed in the repository, gives nothing: the attribute is then most likely the framework's.
 */
export function attributeReading(written: 'yes' | 'no' | 'maybe' | undefined, suffixed: 'yes' | 'no' | 'maybe' | undefined, hasSuffixed: boolean): 'written' | 'suffixed' | undefined {
  if (written === 'yes') return suffixed === 'yes' ? undefined : 'written';
  if (suffixed === 'yes' || suffixed === 'maybe') return 'suffixed';
  return written === 'maybe' && !hasSuffixed ? 'written' : undefined;
}

const LANGUAGE = 'csharp';

/**
 * The lookup over one symbol table. `bind` gives the key of the one type an ordered group of readings binds for the file that wrote it, or undefined when it binds none or more than one; the resolver passes its own reading of a hint, so a base is found exactly as a reference to it is.
 */
export function makeCsharpTypeLookup(table: SymbolTable, bind: (readings: SymbolHint[], fromFile: string) => string | undefined): CsharpTypeLookup {
  const memo = new Map<string, CsharpBases>();

  const bases = (typeKey: string): CsharpBases => {
    const known = memo.get(typeKey);
    if (known !== undefined) return known;
    const result: CsharpBases = { inside: [], outside: [] };
    // Set before the bases are bound: a base list that names its own type through itself ends here.
    memo.set(typeKey, result);
    for (const { value, files } of table.valuesOf(LANGUAGE, baseListKey(typeKey))) {
      const base = decodeBase(value);
      for (const file of files) {
        const key = bind(base.readings, file);
        if (key === undefined) {
          if (!result.outside.includes(base.name)) result.outside.push(base.name);
        } else if (!result.inside.includes(key)) result.inside.push(key);
      }
    }
    return result;
  };

  const isInterface = (typeKey: string): boolean => table.has(LANGUAGE, interfaceKey(typeKey));

  /** The bases a type inherits nested types from: its base class, or for an interface its base interfaces. */
  const inherited = (typeKey: string): string[] => {
    const all = bases(typeKey).inside;
    return isInterface(typeKey) ? all : all.filter((b) => !isInterface(b));
  };

  /** The lookup of `name` in `typeKey` and then in its base classes, nearest first: the nested types of the first level that has one, or, with `members`, the word that a level before it has a member of that name that is no type. */
  const find = (typeKey: string, name: string, members: boolean): { keys: string[]; member: boolean; owners?: string[] } => {
    const own = `${typeKey}+${name}`;
    if (table.has(LANGUAGE, own)) return { keys: [own], member: false };
    if (members && (table.has(LANGUAGE, memberKey(typeKey, name)) || table.has(LANGUAGE, privateMemberKey(typeKey, name)))) return { keys: [], member: true, owners: [typeKey] };
    const seen = new Set([typeKey]);
    let level = inherited(typeKey);
    while (level.length > 0) {
      const found = [...new Set(level.map((b) => `${b}+${name}`))].filter((k) => table.has(LANGUAGE, k));
      if (found.length > 0) return { keys: found, member: false };
      const owners = members ? level.filter((b) => table.has(LANGUAGE, memberKey(b, name))) : [];
      if (owners.length > 0) return { keys: [], member: true, owners };
      const next: string[] = [];
      for (const b of level) {
        if (seen.has(b)) continue;
        seen.add(b);
        next.push(...inherited(b));
      }
      level = next.filter((b) => !seen.has(b));
    }
    return { keys: [], member: false };
  };

  const nested = (typeKey: string, name: string): string[] => find(typeKey, name, false).keys;

  const simpleName = (typeKey: string, name: string): 'member' | 'type' | 'none' => {
    const found = find(typeKey, name, true);
    return found.member ? 'member' : found.keys.length > 0 ? 'type' : 'none';
  };

  const path = (typeKey: string, segments: readonly string[]): string[] => {
    let current = [typeKey];
    for (const segment of segments) {
      current = [...new Set(current.flatMap((k) => nested(k, segment)))];
      if (current.length === 0) break;
    }
    return current;
  };

  const attributeMemo = new Map<string, 'yes' | 'no' | 'maybe'>();
  const attributeClass = (typeKey: string): 'yes' | 'no' | 'maybe' => {
    const known = attributeMemo.get(typeKey);
    if (known !== undefined) return known;
    // Set before the bases are asked: a base chain that leads back here adds nothing.
    attributeMemo.set(typeKey, 'no');
    let answer: 'yes' | 'no' | 'maybe' = 'no';
    if (!isInterface(typeKey)) {
      const { inside, outside } = bases(typeKey);
      const through = inside.filter((b) => !isInterface(b)).map(attributeClass);
      if (outside.some((name) => ATTRIBUTE_BASE_NAMES.has(name)) || through.includes('yes')) answer = 'yes';
      else if (outside.length > 0 || through.includes('maybe')) answer = 'maybe';
    }
    attributeMemo.set(typeKey, answer);
    return answer;
  };

  const hasMethod = (typeKey: string, call: { method: string; args: number; typeArgs: number }, own: boolean): boolean => {
    const takes = (head: string): boolean => table.valuesOf(LANGUAGE, head).some(({ value }) => shapeTakes(value, call.typeArgs, call.args));
    if (own && takes(privateMethodKey(typeKey, call.method))) return true;
    const seen = new Set<string>();
    const pending = [typeKey];
    while (pending.length > 0) {
      const key = pending.pop()!;
      if (seen.has(key)) continue;
      seen.add(key);
      if (takes(methodKey(key, call.method))) return true;
      pending.push(...bases(key).inside);
    }
    return false;
  };

  const memberTypes = (typeKey: string, name: string): string[] => {
    const keys: string[] = [];
    for (const owner of find(typeKey, name, true).owners ?? []) {
      for (const { value, files } of table.valuesOf(LANGUAGE, memberTypeKey(owner, name))) {
        const written = decodeBase(value);
        for (const file of files) {
          const key = bind(written.readings, file);
          if (key !== undefined && !keys.includes(key)) keys.push(key);
        }
      }
    }
    return keys;
  };

  return { bases, nested, simpleName, path, attributeClass, hasMethod, memberTypes };
}
