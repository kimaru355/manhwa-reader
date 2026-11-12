import * as api from './api';
import type { Series, SeriesCategory, SourceId, Tier } from './types';

export type Sort = 'latest' | 'popular' | 'week';

export type CommunityRec = {
  id: string;
  source: SourceId;
  seriesId: string;
  title: string;
  cover: string | null;
  url: string | null;
  category: SeriesCategory;
  tier: Tier;
  note: string | null;
  createdAt: string;
  votes: number;
  voted: boolean;
};

export type CommunityPage = { items: CommunityRec[]; nextCursor: string | null };

export type CommunityFilters = {
  sort: Sort;
  q?: string;
  category?: SeriesCategory;
  tier?: Tier;
  cursor?: string | null;
};

const query = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');

export const fetchCommunity = (f: CommunityFilters) =>
  api.publicGet<CommunityPage>(
    `/recommendations/community?${query({
      sort: f.sort,
      q: f.q?.trim() || undefined,
      category: f.category,
      tier: f.tier,
      cursor: f.cursor ?? undefined,
      limit: '20',
    })}`,
  );

export const vote = (id: string) =>
  api.authed<{ votes: number; voted: boolean }>(`/community/recommendations/${encodeURIComponent(id)}/vote`, { method: 'PUT' });

export const unvote = (id: string) =>
  api.authed<{ votes: number; voted: boolean }>(`/community/recommendations/${encodeURIComponent(id)}/vote`, { method: 'DELETE' });

export const communityToSeries = (r: CommunityRec): Series => ({
  key: `${r.source}:${r.seriesId}`,
  source: r.source,
  id: r.seriesId,
  title: r.title,
  cover: r.cover ?? undefined,
  category: r.category,
  url: r.url ?? undefined,
});

// ---- Community bookmarks ------------------------------------------------------------------

export type CommunityBookmark = {
  id: string;
  chapterId: string;
  chapterName: string;
  page: number;
  note: string | null;
  createdAt: string;
};

const bookmarkCache = new Map<string, { at: number; items: CommunityBookmark[] }>();
const FRESH_MS = 5 * 60_000;

/** Approved community bookmarks of a title. Cached briefly; failures give an empty list (they are optional). */
export async function fetchCommunityBookmarks(series: Series): Promise<CommunityBookmark[]> {
  if (series.source === 'external') return [];
  const hit = bookmarkCache.get(series.key);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.items;
  try {
    const res = await api.publicGet<{ items: CommunityBookmark[] }>(
      `/community/bookmarks?${query({ source: series.source, seriesId: series.id })}`,
    );
    bookmarkCache.set(series.key, { at: Date.now(), items: res.items });
    return res.items;
  } catch {
    return hit?.items ?? [];
  }
}

export type Suggestion = {
  id: string;
  source: SourceId;
  seriesId: string;
  seriesTitle: string;
  chapterId: string;
  chapterName: string;
  page: number;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejectReason: string | null;
  createdAt: string;
};

export const submitBookmark = (
  series: Series,
  b: { chapterId: string; chapterName: string; page: number; note: string },
) =>
  api.authed<{ id: string; status: string }>('/community/bookmarks', {
    method: 'POST',
    body: {
      source: series.source,
      seriesId: series.id,
      seriesTitle: series.title,
      chapterId: b.chapterId,
      chapterName: b.chapterName,
      page: b.page,
      note: b.note.trim() || null,
    },
  });

export const mySuggestions = async () => (await api.authed<{ items: Suggestion[] }>('/me/community-bookmarks')).items;

export const withdrawSuggestion = (id: string) =>
  api.authed(`/me/community-bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(() => undefined);
