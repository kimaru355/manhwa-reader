import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { useDownloads } from './downloads';
import { getSource } from './sources';
import type { Chapter, Series } from './types';
import { naturalCompare } from './util';

export function openSeries(series: Series) {
  if (series.source === 'external') {
    if (series.url) Linking.openURL(series.url).catch(() => {});
    return;
  }
  router.push({ pathname: '/series', params: { ref: JSON.stringify(series) } });
}

export function openReader(series: Series, chapterId: string, page = 1) {
  router.push({ pathname: '/reader', params: { ref: JSON.stringify(series), ch: chapterId, page: String(page) } });
}

export function parseRef(raw: string | undefined): Series | null {
  try {
    const s = raw ? (JSON.parse(raw) as Series) : null;
    return s && s.key && s.source && s.id && s.title ? s : null;
  } catch {
    return null;
  }
}

const cache = new Map<string, Chapter[]>();

/**
 * Chapters of a title, oldest first. Fetched from its source; when offline, falls back to what has
 * been downloaded.
 */
export function useChapters(series: Series | null) {
  const { getDownloaded } = useDownloads();
  const key = series?.key;
  const [online, setOnline] = useState<Chapter[] | null>(() => (key ? (cache.get(key) ?? null) : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const source = series ? getSource(series.source) : undefined;
    if (!series || !source) return;
    let alive = true;
    const hit = cache.get(series.key);
    if (hit && attempt === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOnline(hit);
      return;
    }
    setLoading(true);
    setError(null);
    source
      .chapters(series)
      .then((list) => {
        cache.set(series.key, list);
        if (alive) setOnline(list);
      })
      .catch((e) => alive && setError(String(e?.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // `series` is identified by its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const saved = key ? getDownloaded(key)?.chapters : undefined;
  const chapters: Chapter[] =
    online ??
    [...(saved ?? [])]
      .sort((a, b) => naturalCompare(a.name, b.name))
      .map(({ id, name, url }) => ({ id, name, url }));

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { chapters, loading, error, reload, offline: !online };
}
