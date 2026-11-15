import type { Bookmark, Series } from './types';

/**
 * What the account server accepts (site: lib/api/schemas.ts). The server refuses a whole request when one
 * item in it breaks a rule, so anything that would be refused is kept out of the upload and stays on this
 * phone only; otherwise a single odd title would stop every later sync.
 *
 * Plain data and pure functions, so the rules can be tested.
 */
const SERVER_SOURCES = ['mangadex', 'mangapill', 'mangaread', 'webtoons', 'hentai20', 'novelfull', 'novelbin', 'external'];
const SERVER_CATEGORIES = ['manga', 'manhwa', 'interesting', 'novel'];

const MAX = { key: 300, id: 200, title: 300, url: 2000, bookmarkId: 64, chapterId: 300, chapterName: 300, note: 200 };

const text = (v: unknown, max: number, min = 1): v is string => typeof v === 'string' && v.length >= min && v.length <= max;
const optionalText = (v: unknown, max: number) => v === undefined || v === null || text(v, max, 0);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** Whether the server can store this title. */
export function sendableSeries(s: Series): boolean {
  return (
    !!s &&
    text(s.key, MAX.key) &&
    text(s.id, MAX.id) &&
    typeof s.title === 'string' &&
    s.title.length > 0 &&
    SERVER_SOURCES.includes(s.source) &&
    SERVER_CATEGORIES.includes(s.category) &&
    optionalText(s.cover, MAX.url) &&
    optionalText(s.url, MAX.url)
  );
}

/** Only the fields the server knows (it rejects unknown ones), with the title cut to its limit. */
export function toServerSeries(s: Series): Series {
  return {
    key: s.key,
    source: s.source,
    id: s.id,
    title: s.title.slice(0, MAX.title),
    ...(s.cover ? { cover: s.cover } : {}),
    category: s.category,
    ...(s.url ? { url: s.url } : {}),
  };
}

/** Whether the server can store this bookmark. */
export function sendableBookmark(b: Bookmark): boolean {
  return (
    !!b &&
    text(b.id, MAX.bookmarkId) &&
    text(b.seriesKey, MAX.key) &&
    text(b.chapterId, MAX.chapterId) &&
    typeof b.chapterName === 'string' &&
    typeof b.note === 'string' &&
    count(b.page) &&
    b.page > 0 &&
    count(b.ts) &&
    (b.updatedAt === undefined || count(b.updatedAt))
  );
}

export function toServerBookmark(b: Bookmark): Bookmark {
  return {
    id: b.id,
    seriesKey: b.seriesKey,
    chapterId: b.chapterId,
    chapterName: b.chapterName.slice(0, MAX.chapterName),
    page: b.page,
    note: b.note.slice(0, MAX.note),
    ts: b.ts,
    updatedAt: b.updatedAt ?? b.ts,
  };
}
