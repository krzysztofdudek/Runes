import type { SymbolTable } from '../symbol-table.mjs';
import type { TargetHint, CsharpArgType } from './types.mjs';
type SymbolHint = Extract<TargetHint, {
    kind: 'symbol';
}>;
/** The bases one C# type declares, over every part of it: `inside` the keys of those the repository declares, `outside` the written names of those it does not (a framework type, or a name this reader cannot bind to one type). */
export interface CsharpBases {
    inside: string[];
    outside: string[];
}
/** What the resolver reads of C# types beyond their keys: the base lists the extractor records (`baseListKey`) and what a type inherits through them. A type is named by its key, or as a reading written inside a C#11 `file` type names that type (`fileTypeRef`), and then `fromFile` says whose it is: such a type has the bases its own file records (`fileBaseListKey`) and nothing a published type of the same name declares. */
export interface CsharpTypeLookup {
    /** The bases of the type `typeKey`, classes and interfaces alike. */
    bases(typeKey: string, fromFile?: string): CsharpBases;
    /** The keys of the nested type `name` of `typeKey`: the type's own, or else the one its nearest base class in the repository declares (C# spec §7.6.1: the nested types of a type's base classes are its members). An interface inherits those of its base interfaces. Empty when none. */
    nested(typeKey: string, name: string, fromFile?: string): string[];
    /** What the simple name `name` is inside the type `typeKey`, where a value's name may stand: `member` when the type, in any part, declares a member of that name that is no type, or its nearest base class in the repository that knows the name declares one a derived type can see; `type` when a nested type of that name is found first (`nested`); `none` when neither the type nor a base class in the repository knows the name. */
    simpleName(typeKey: string, name: string, fromFile?: string): 'member' | 'type' | 'none';
    /** `nested` along a dotted path: `segments[0]` in `typeKey`, the next in what that gave. */
    path(typeKey: string, segments: readonly string[], fromFile?: string): string[];
    /** Whether the type `typeKey` is an attribute class: `yes` when its base classes, followed through the repository, reach `System.Attribute`; `no` when it is an interface, or every base of it lies in the repository and none reaches `System.Attribute` (a type that lists no base among them); `maybe` when a base leaves the repository under another name, which may or may not derive from it. */
    attributeClass(typeKey: string): 'yes' | 'no' | 'maybe';
    /** True when a call `value.method(…)` with `args` arguments and `typeArgs` written type arguments, on a value of the type `typeKey`, written inside the types `from`, finds an instance method it fits by those counts (`shapeTakes`), whose parameters can take the arguments as far as `argTypes` and the method's record say (see `CsharpArgType`; read only with `fromFile`), and that it can reach: one the type declares, in any part, or one of its base classes in the repository, to any depth (for an interface, its base interfaces). A protected method counts where one of `from` is the type that declares it or derives from it and `typeKey` is that calling type or derives from it, a private one where one of `from` is the type that declares it. */
    hasMethod(typeKey: string, call: {
        method: string;
        args: number;
        typeArgs: number;
        argTypes?: CsharpArgType[];
    }, from: readonly string[], fromFile?: string): boolean;
    /** The keys of the types the member `name` is written with, where `simpleName(typeKey, name)` answers `member` for a field or a property: the written type of each declaration of it at the level that declares it, bound where it is declared. Empty when the member writes no type of the repository. */
    memberTypes(typeKey: string, name: string, fromFile?: string): string[];
    /** True when one of the extension methods `file` declares under the extension key `key` can take a call with `call.args` arguments beside the receiver and `call.typeArgs` written type arguments (`shapeTakes` over the file's `shapes:<key>` record), or when the file declares no such record. */
    extensionTakes(key: string, file: string, call: {
        args: number;
        typeArgs: number;
    }): boolean;
}
/**
 * Which of an attribute's two readings C# takes (spec §23.3), from what each binds: `written` and `suffixed` are the attribute-class answers of the types the written name and the `Attribute`-suffixed name bind (undefined where the reading binds no type of the repository), and `hasSuffixed` says whether the attribute has a suffixed reading at all (a written name that already ends in `Attribute` has none). A reading that binds an attribute class is the result, and both doing so is the compiler's error CS1614, which gives nothing. A type that only may be one is taken as the suffixed reading, the name the convention gives an attribute class, and as the written reading only where no suffixed reading exists; a written name without the suffix that only may be one, beside nothing suffixed in the repository, gives nothing: the attribute is then most likely the framework's.
 */
export declare function attributeReading(written: 'yes' | 'no' | 'maybe' | undefined, suffixed: 'yes' | 'no' | 'maybe' | undefined, hasSuffixed: boolean): 'written' | 'suffixed' | undefined;
/**
 * The lookup over one symbol table. `bind` gives the key of the one type an ordered group of readings binds for the file that wrote it, or undefined when it binds none or more than one; the resolver passes its own reading of a hint, so a base is found exactly as a reference to it is. `declared` says whether some reading of such a group names a declaration that file can see at all: where `bind` gives nothing and `declared` answers no, the name is a type from outside the repository. Without it every unbound name may be a type of the repository.
 */
export declare function makeCsharpTypeLookup(table: SymbolTable, bind: (readings: SymbolHint[], fromFile: string) => string | undefined, declared?: (readings: SymbolHint[], fromFile: string) => boolean): CsharpTypeLookup;
export {};
