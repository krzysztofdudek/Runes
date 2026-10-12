import path from 'node:path';
import type { FileSource } from '../file-view.mjs';

/**
 * The MSBuild reading shared by the two C# project readers: the global-using scoping (`csharp-project.mts`) and the reference graph (`csharp-reach.mts`). Internal: nothing here is exported from the package.
 *
 * The XML reading is deliberately narrow (start tags, a few properties) and never evaluates a condition or a property.
 */

/** The attributes of one XML start tag's attribute text, keys lower-cased. */
export function attributes(attrText: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrText)) !== null) out.set(m[1].toLowerCase(), (m[2] ?? m[3] ?? '').trim());
  return out;
}

/** The text with XML comments removed. */
export function stripComments(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

/** The last value of `<Name>value</Name>` in the text, or undefined. */
export function lastProperty(xml: string, name: string): string | undefined {
  const re = new RegExp(`<${name}\\b[^>]*>([^<]*)</${name}>`, 'gi');
  let value: string | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) value = m[1].trim();
  return value;
}

/** True for the name of a C# project file. */
export function isCsproj(name: string): boolean {
  return name.toLowerCase().endsWith('.csproj');
}

/** What the readers need to find a file's project and the MSBuild files above it, over one file source. */
export interface ProjectLocator {
  /** The sorted names inside `dir` (memoized); empty when `dir` is not a directory of the source. */
  list(dir: string): string[];
  /** `dir` and its ancestors up to the root (`.`), nearest first. */
  ancestors(dir: string): string[];
  /** The directory of the project a file belongs to: the nearest ancestor directory (the file's own included) that holds a `.csproj`; null when there is none. */
  projectDirOf(file: string): string | null;
  /** The nearest file called `basename` in `dir` or an ancestor, or undefined. */
  nearestFile(dir: string, basename: string): string | undefined;
}

/** The locator over one file source. */
export function makeProjectLocator(source: FileSource): ProjectLocator {
  const listings = new Map<string, string[]>();
  const list = (dir: string): string[] => {
    const hit = listings.get(dir);
    if (hit !== undefined) return hit;
    const names = (source.list(dir) ?? []).map((e) => e.name).sort();
    listings.set(dir, names);
    return names;
  };
  const ancestors = (dir: string): string[] => {
    // path.posix.dirname never yields ''; it is a fixed point at the root ('.', or '/').
    const out = [dir];
    for (let up = path.posix.dirname(dir); up !== out[out.length - 1]; up = path.posix.dirname(up)) out.push(up);
    return out;
  };
  const projectDirOf = (file: string): string | null => {
    for (const dir of ancestors(path.posix.dirname(file))) {
      if (list(dir).some(isCsproj)) return dir;
    }
    return null;
  };
  const nearestFile = (dir: string, basename: string): string | undefined => {
    for (const d of ancestors(dir)) {
      if (list(d).includes(basename)) return d === '.' ? basename : `${d}/${basename}`;
    }
    return undefined;
  };
  return { list, ancestors, projectDirOf, nearestFile };
}
