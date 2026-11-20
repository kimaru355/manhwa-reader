/**
 * Chapter ranges typed by the reader ("1" to "100"), counted by position in the oldest-first chapter list.
 * Pure, so it is covered by the node tests.
 */

export type RangeResult = { ok: true; start: number; end: number } | { ok: false; message: string };

const num = (s: string) => {
  const t = s.trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : NaN;
};

/**
 * Reads a 1-based, inclusive range. An empty "from" means the first chapter and an empty "to" the last;
 * the two are swapped if typed the wrong way round, and "to" past the end stops at the last chapter.
 */
export function parseRange(fromText: string, toText: string, total: number): RangeResult {
  if (total <= 0) return { ok: false, message: 'This title has no chapters.' };
  let from = num(fromText);
  let to = num(toText);
  if (Number.isNaN(from) || Number.isNaN(to)) return { ok: false, message: 'Use whole numbers, like 1 and 100.' };
  from ??= 1;
  to ??= total;
  if (from > to) [from, to] = [to, from];
  if (from < 1) from = 1;
  if (from > total) return { ok: false, message: `There ${total === 1 ? 'is only 1 chapter' : `are only ${total} chapters`}.` };
  return { ok: true, start: from, end: Math.min(to, total) };
}

/** The chapters in a parsed range. */
export const sliceRange = <T>(chapters: T[], r: { start: number; end: number }) => chapters.slice(r.start - 1, r.end);

/** A range of `size` chapters starting at 1-based `from`, kept inside the list. */
export function nextBlock(from: number, size: number, total: number) {
  const start = Math.min(Math.max(1, from), Math.max(1, total));
  return { start, end: Math.min(total, start + size - 1) };
}
