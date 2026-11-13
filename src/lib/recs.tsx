import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import bundled from '../data/recommendations.json';
import { API_BASE_URL } from './config';
import { friendly, toastError } from './errors';
import type { AuthorBookmark, Category, RecsFile, Recommendation, Series, SourceId, Tier } from './types';

/** Where the app fetches the author's recommendations from (can be overridden in Settings). */
export const DEFAULT_RECS_URL = `${API_BASE_URL}/recommendations.json`;

const KEYS = { url: 'recsUrl1', cache: 'recsCache1' } as const;

const CATEGORIES: Category[] = ['manga', 'manhwa', 'interesting', 'novel'];
const TIERS: Tier[] = ['all-time', 'interesting', 'good', 'trial'];
const SOURCES: SourceId[] = ['mangadex', 'webtoons', 'hentai20', 'novelbin', 'external'];

export const TIER_LABEL: Record<Tier, string> = {
  'all-time': 'All-time',
  interesting: 'Interesting',
  good: 'Good',
  trial: 'Worth a trial',
};
export const TIER_ORDER = TIERS;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Accepts anything the author might publish and keeps only what is usable. */
export function parseRecs(raw: unknown): RecsFile {
  const o = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(o.recommendations) ? o.recommendations : [];
  const recommendations: Recommendation[] = [];
  for (const r of list as Record<string, unknown>[]) {
    const source = r?.source as SourceId;
    const category = r?.category as Category;
    const tier = r?.tier as Tier;
    const id = str(r?.id);
    const title = str(r?.title);
    if (!SOURCES.includes(source) || !CATEGORIES.includes(category) || !TIERS.includes(tier) || !id || !title) continue;
    const bookmarks = (Array.isArray(r.bookmarks) ? r.bookmarks : [])
      .map((b: Record<string, unknown>): AuthorBookmark | null => {
        const chapterId = str(b?.chapterId);
        if (!chapterId) return null;
        return {
          chapterId,
          chapterName: str(b.chapterName),
          page: typeof b.page === 'number' && b.page > 0 ? Math.floor(b.page) : undefined,
          note: str(b.note),
        };
      })
      .filter((b): b is AuthorBookmark => !!b);
    recommendations.push({
      source,
      id,
      title,
      category,
      tier,
      cover: str(r.cover),
      url: str(r.url),
      note: str(r.note),
      bookmarks,
    });
  }
  const sources: RecsFile['sources'] = {};
  const rawSources = (o.sources ?? {}) as Record<string, unknown>;
  for (const c of CATEGORIES) {
    const arr = Array.isArray(rawSources[c]) ? (rawSources[c] as Record<string, unknown>[]) : [];
    const ok = arr
      .filter((s) => SOURCES.includes(s?.source as SourceId))
      .map((s) => ({ source: s.source as SourceId, name: str(s.name) }));
    if (arr.length) sources[c] = ok;
  }
  return { version: 1, updated: str(o.updated), sources, recommendations };
}

export const toSeries = (r: Recommendation): Series => ({
  key: `${r.source}:${r.id}`,
  source: r.source,
  id: r.id,
  title: r.title,
  cover: r.cover,
  category: r.category,
  url: r.url,
});

type RecsContext = {
  recs: RecsFile;
  url: string;
  setUrl: (url: string) => void;
  loading: boolean;
  error: string | null;
  refresh: (url?: string) => Promise<void>;
  /** The author's recommendation for a title, if there is one. */
  find: (key: string) => Recommendation | undefined;
};

const Ctx = createContext<RecsContext | null>(null);

export const useRecs = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRecs must be used inside RecsProvider');
  return v;
};

export function RecsProvider({ children }: { children: ReactNode }) {
  const [recs, setRecs] = useState<RecsFile>(() => parseRecs(bundled));
  const [url, setUrlState] = useState(DEFAULT_RECS_URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (target?: string) => {
    const u = (target ?? '').trim();
    if (!u) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(u, { headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok) throw new Error(`answered ${res.status}`);
      const text = await res.text();
      const parsed = parseRecs(JSON.parse(text));
      setRecs(parsed);
      AsyncStorage.setItem(KEYS.cache, text).catch(() => {});
    } catch (e) {
      setError(`Couldn't update recommendations. ${friendly(e)} Showing the last saved list.`);
      toastError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [savedUrl, cached] = await Promise.all([
        AsyncStorage.getItem(KEYS.url).catch(() => null),
        AsyncStorage.getItem(KEYS.cache).catch(() => null),
      ]);
      const u = savedUrl ?? DEFAULT_RECS_URL;
      setUrlState(u);
      if (cached) {
        try {
          setRecs(parseRecs(JSON.parse(cached)));
        } catch {}
      }
      refresh(u);
    })();
  }, [refresh]);

  const setUrl = useCallback(
    (next: string) => {
      const u = next.trim();
      setUrlState(u);
      AsyncStorage.setItem(KEYS.url, u).catch(() => {});
      refresh(u);
    },
    [refresh],
  );

  const value = useMemo<RecsContext>(() => {
    const byKey = new Map(recs.recommendations.map((r) => [`${r.source}:${r.id}`, r]));
    return { recs, url, setUrl, loading, error, refresh: (u) => refresh(u ?? url), find: (k) => byKey.get(k) };
  }, [recs, url, setUrl, loading, error, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
