// Adds (or replaces) a version's entry in the website's version history, site/lib/changelog.ts.
// Entries there are written in this exact shape, newest first, so they can be found and replaced as text.

const START = 'export const CHANGELOG: VersionEntry[] = [\n';

const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ')}'`;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The entry for `version` as it is written in changelog.ts. */
export function entryText(version, date, changes) {
  return ['  {', `    version: ${quote(version)},`, `    date: ${quote(date)},`, '    changes: [', ...changes.map((c) => `      ${quote(c)},`), '    ],', '  },', ''].join('\n');
}

/**
 * Returns `source` (the text of changelog.ts) with `version`'s entry at the top, or replacing the entry it
 * already has (publishing the same version again). Throws if the file isn't in the expected shape.
 */
export function withEntry(source, version, date, changes) {
  const text = source.replace(/\r\n/g, '\n');
  const at = text.indexOf(START);
  if (at < 0) throw new Error(`Couldn't find "${START.trim()}"`);
  const entry = entryText(version, date, changes);
  const existing = new RegExp(`  \\{\\n    version: '${escapeRe(version)}',\\n[\\s\\S]*?\\n  \\},\\n`);
  if (existing.test(text)) return text.replace(existing, () => entry);
  const head = at + START.length;
  return text.slice(0, head) + entry + text.slice(head);
}
