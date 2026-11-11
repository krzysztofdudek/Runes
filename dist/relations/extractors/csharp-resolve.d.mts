import type { SymbolTable } from '../symbol-table.mjs';
import type { TargetHint } from './types.mjs';
type SymbolHint = Extract<TargetHint, {
    kind: 'symbol';
}>;
/** The bases one C# type declares, over every part of it: `inside` the keys of those the repository declares, `outside` the written names of those it does not (a framework type, or a name this reader cannot bind to one type). */
export interface CsharpBases {
    inside: string[];
    outside: string[];
}
/** What the resolver reads of C# types beyond their keys: the base lists the extractor records (`baseListKey`) and what a type inherits through them. */
export interface CsharpTypeLookup {
    /** The bases of the type `typeKey`, classes and interfaces alike. */
    bases(typeKey: string): CsharpBases;
    /** The keys of the nested type `name` of `typeKey`: the type's own, or else the one its nearest base class in the repository declares (C# spec §7.6.1: the nested types of a type's base classes are its members). An interface inherits those of its base interfaces. Empty when none. */
    nested(typeKey: string, name: string): string[];
    /** `nested` along a dotted path: `segments[0]` in `typeKey`, the next in what that gave. */
    path(typeKey: string, segments: readonly string[]): string[];
}
/**
 * The lookup over one symbol table. `bind` gives the key of the one type an ordered group of readings binds for the file that wrote it, or undefined when it binds none or more than one; the resolver passes its own reading of a hint, so a base is found exactly as a reference to it is.
 */
export declare function makeCsharpTypeLookup(table: SymbolTable, bind: (readings: SymbolHint[], fromFile: string) => string | undefined): CsharpTypeLookup;
export {};
