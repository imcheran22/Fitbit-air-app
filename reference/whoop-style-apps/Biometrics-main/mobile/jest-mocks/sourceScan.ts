// Reads src as text for the convention guards (buttons, typography): every
// source file under a folder, and the attribute text of one JSX opening tag.
// Shared by the guards in __tests__/conventions.
import * as fs from 'fs';
import * as path from 'path';

/** Every .ts / .tsx / .js / .jsx file under `dir`, as full paths. */
export function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * The attribute text of the JSX opening tag that starts at `from`: up to its
 * closing `>` at brace depth 0. Comments are left out, so an apostrophe in a
 * `// another device's` comment between props cannot open a quote, and a prop
 * that is only mentioned in a comment does not count.
 */
export function openingTag(source: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  let out = '';
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== '\\') quote = null;
    } else if (c === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      i = (end === -1 ? source.length : end) - 1;
      continue;
    } else if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = (end === -1 ? source.length : end + 2) - 1;
      continue;
    } else if (c === '{') depth++;
    else if (c === '}') depth--;
    // Strings are tracked inside braces too, so a '}' or '//' in one (a URL) is just text.
    else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (depth === 0 && c === '>') return out + c;
    out += c;
  }
  return out;
}
