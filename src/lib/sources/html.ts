/** HTML entity decoding for scraped text. No imports, so the node tests can use it. */
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  // Typographic ones novels use a lot.
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  mdash: '—',
  ndash: '–',
  hellip: '…',
};

/** The character with this code, or the text as written when the code isn't a real character. */
const fromCode = (code: number, written: string) => {
  try {
    return String.fromCodePoint(code);
  } catch {
    return written;
  }
};

/** Turns `&amp;`, `&#8217;` and the like back into characters. */
export const decodeHtml = (s: string) =>
  s
    .replace(/&#(\d+);/g, (m, n) => fromCode(Number(n), m))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => fromCode(parseInt(n, 16), m))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .trim();
