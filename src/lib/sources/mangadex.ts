import type { Chapter, Series } from '../types';
import { getJson, qs } from './http';
import type { Source } from './types';

const API = 'https://api.mangadex.org';
const PAGE = 30;
/** MangaDex sends browser-like clients to a bot check; a plain app User-Agent gets the API. */
const HEADERS = { 'User-Agent': 'ManhwaReader/1.0' };
const RATINGS = [
  ['contentRating[]', 'safe'],
  ['contentRating[]', 'suggestive'],
] as const;

type MdRel = { type: string; attributes?: { fileName?: string } };
type MdManga = {
  id: string;
  attributes: { title: Record<string, string>; altTitles?: Record<string, string>[] };
  relationships: MdRel[];
};

function toSeries(m: MdManga): Series {
  const title =
    m.attributes.title.en ??
    m.attributes.altTitles?.find((t) => t.en)?.en ??
    Object.values(m.attributes.title)[0] ??
    'Untitled';
  const file = m.relationships.find((r) => r.type === 'cover_art')?.attributes?.fileName;
  return {
    key: `mangadex:${m.id}`,
    source: 'mangadex',
    id: m.id,
    title,
    cover: file ? `https://uploads.mangadex.org/covers/${m.id}/${file}.256.jpg` : undefined,
    category: 'manga',
  };
}

/**
 * Whether each title has at least one English chapter that can be read here. Licensed titles keep only links to
 * the publisher's site, which MangaDex still counts as "available chapters", so the browse filter alone lets them
 * through and they open with an empty chapter list. Answers are kept for a few hours; a failed check keeps the title.
 */
const readable = new Map<string, { ok: boolean; at: number }>();
const READABLE_FRESH_MS = 6 * 60 * 60_000;

async function hasReadableChapters(id: string): Promise<boolean> {
  const hit = readable.get(id);
  if (hit && Date.now() - hit.at < READABLE_FRESH_MS) return hit.ok;
  try {
    const res = await getJson<{ total: number }>(
      `${API}/manga/${encodeURIComponent(id)}/feed?${qs([['limit', 1], ['translatedLanguage[]', 'en'], ['includeExternalUrl', 0], ...RATINGS])}`,
      HEADERS,
    );
    const ok = res.total > 0;
    if (readable.size > 5000) readable.clear();
    readable.set(id, { ok, at: Date.now() });
    return ok;
  } catch {
    return true;
  }
}

/** Drops the titles with nothing to read, checking a few at a time so MangaDex isn't flooded. */
async function onlyReadable(items: Series[]): Promise<Series[]> {
  const keep = new Array<boolean>(items.length).fill(true);
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < items.length) {
        const i = next++;
        keep[i] = await hasReadableChapters(items[i].id);
      }
    }),
  );
  return items.filter((_, i) => keep[i]);
}

export const mangadex: Source = {
  id: 'mangadex',
  name: 'MangaDex',
  imageHeaders: {},

  async browse({ page, query }) {
    const q = query?.trim();
    const params: (readonly [string, string | number])[] = [
      ['limit', PAGE],
      ['offset', page * PAGE],
      ['includes[]', 'cover_art'],
      ['availableTranslatedLanguage[]', 'en'],
      ['hasAvailableChapters', 'true'],
      ...RATINGS,
      q ? ['title', q] : ['order[followedCount]', 'desc'],
    ];
    const res = await getJson<{ data: MdManga[]; total: number }>(`${API}/manga?${qs(params)}`, HEADERS);
    return { items: await onlyReadable(res.data.map(toSeries)), hasMore: (page + 1) * PAGE < res.total };
  },

  async chapters(series) {
    type Feed = { id: string; attributes: { chapter: string | null; title: string | null; pages: number } };
    const out: Chapter[] = [];
    const seen = new Set<string>();
    for (let offset = 0; offset < 10_000; offset += 500) {
      const url = `${API}/manga/${encodeURIComponent(series.id)}/feed?${qs([
        ['limit', 500],
        ['offset', offset],
        ['translatedLanguage[]', 'en'],
        ['order[volume]', 'asc'],
        ['order[chapter]', 'asc'],
        ['includeExternalUrl', 0],
        ...RATINGS,
      ])}`;
      const res = await getJson<{ data: Feed[]; total: number }>(url, HEADERS);
      for (const c of res.data) {
        const { chapter, title, pages } = c.attributes;
        if (!pages) continue;
        // Several groups translate the same chapter; keep the first.
        const num = chapter ?? c.id;
        if (seen.has(num)) continue;
        seen.add(num);
        const name = chapter ? `Ch. ${chapter}${title ? ` – ${title}` : ''}` : title || 'Oneshot';
        out.push({ id: c.id, name });
      }
      if (offset + 500 >= res.total) break;
    }
    return out;
  },

  async pages(_series, chapter) {
    const res = await getJson<{ baseUrl: string; chapter: { hash: string; data: string[] } }>(
      `${API}/at-home/server/${encodeURIComponent(chapter.id)}`,
      HEADERS,
    );
    return res.chapter.data.map((f) => `${res.baseUrl}/data/${res.chapter.hash}/${f}`);
  },
};
