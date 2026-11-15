import type { Bookmark, Recent, Series } from './types';

/**
 * Checks for data that comes from outside the app (a backup file, something a friend shared). Entries that
 * are not what the app expects are dropped instead of being saved, where they would break the screens that
 * list them. Pure functions, so the rules can be tested.
 */
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optStr = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export function cleanSeries(v: unknown): Series | null {
  if (!isObj(v) || !str(v.key) || !str(v.source) || !str(v.id) || !str(v.title) || !str(v.category)) return null;
  const cover = optStr(v.cover);
  const url = optStr(v.url);
  return {
    key: v.key,
    source: v.source as Series['source'],
    id: v.id,
    title: v.title,
    ...(cover ? { cover } : {}),
    category: v.category as Series['category'],
    ...(url ? { url } : {}),
  };
}

export function cleanRecent(v: unknown): Recent | null {
  if (!isObj(v)) return null;
  const series = cleanSeries(v.series);
  if (!series || !str(v.chapterId)) return null;
  return {
    series,
    chapterId: v.chapterId,
    chapterName: typeof v.chapterName === 'string' ? v.chapterName : '',
    page: num(v.page) && v.page >= 1 ? Math.floor(v.page) : 1,
    total: num(v.total) && v.total >= 1 ? Math.floor(v.total) : 1,
    ts: num(v.ts) ? v.ts : 0,
  };
}

export function cleanBookmark(v: unknown): Bookmark | null {
  if (!isObj(v) || !str(v.id) || !str(v.seriesKey) || !str(v.chapterId) || !num(v.page) || v.page < 1) return null;
  return {
    id: v.id,
    seriesKey: v.seriesKey,
    chapterId: v.chapterId,
    chapterName: typeof v.chapterName === 'string' ? v.chapterName : '',
    page: Math.floor(v.page),
    note: typeof v.note === 'string' ? v.note : '',
    ts: num(v.ts) && v.ts >= 0 ? Math.floor(v.ts) : 0,
    ...(num(v.updatedAt) && v.updatedAt >= 0 ? { updatedAt: Math.floor(v.updatedAt) } : {}),
  };
}

/** The usable entries of `v` (an array of anything), in order, without repeats of the same key. */
export function cleanList<T>(v: unknown, clean: (x: unknown) => T | null, keyOf: (x: T) => string): T[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const raw of v) {
    const x = clean(raw);
    if (!x || seen.has(keyOf(x))) continue;
    seen.add(keyOf(x));
    out.push(x);
  }
  return out;
}
