import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { startBackground, stopBackground, updateBackground } from './background';
import { friendly } from './errors';
import { chapterDir, downloadFile, fetchPages, removeDir, seriesDir } from './files';
import { getSource, imageHeaders, isKnownSource } from './sources';
import type { Chapter, DownloadedChapter, DownloadedSeries, Series } from './types';

const KEYS = { items: 'downloads1', queue: 'downloadQueue1', started: 'downloadStarted1' } as const;

export type Job = {
  series: Series;
  chapter: Chapter;
  /** `queued` also covers paused: a queued job only runs while its title is started. */
  state: 'queued' | 'active' | 'error';
  done: number;
  total: number;
  error?: string;
};

const jobKey = (seriesKey: string, chapterId: string) => `${seriesKey}|${chapterId}`;
const keyOf = (j: Job) => jobKey(j.series.key, j.chapter.id);

type DownloadsContext = {
  items: DownloadedSeries[];
  /** Everything waiting, running or failed, in the order it was added. */
  queue: Job[];
  /** Titles allowed to download right now. Others wait until started. */
  started: string[];
  getDownloaded: (seriesKey: string) => DownloadedSeries | undefined;
  getChapter: (seriesKey: string, chapterId: string) => DownloadedChapter | undefined;
  getJob: (seriesKey: string, chapterId: string) => Job | undefined;
  /** Adds chapters to the list. Nothing downloads until start() is called. Returns how many were new. */
  enqueue: (series: Series, chapters: Chapter[]) => number;
  /** Starts one title, or every title in the queue. */
  start: (seriesKey?: string) => void;
  /** Pauses one title, or everything. Progress is kept and can be resumed. */
  stop: (seriesKey?: string) => void;
  /** Removes a chapter from the list (deleting what was partly downloaded). */
  cancel: (seriesKey: string, chapterId: string) => void;
  cancelSeries: (seriesKey: string) => void;
  retry: (seriesKey: string, chapterId: string) => void;
  /** Moves a title earlier (-1) or later (1) in the download order. */
  moveSeries: (seriesKey: string, direction: -1 | 1) => void;
  removeChapter: (seriesKey: string, chapterId: string) => void;
  removeSeries: (seriesKey: string) => void;
};

const Ctx = createContext<DownloadsContext | null>(null);

export const useDownloads = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDownloads must be used inside DownloadsProvider');
  return v;
};

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<DownloadedSeries[]>([]);
  const [queue, setQueue] = useState<Job[]>([]);
  const [started, setStarted] = useState<string[]>([]);
  const itemsRef = useRef(items);
  const queueRef = useRef(queue);
  const startedRef = useRef(started);
  const running = useRef(false);
  const removed = useRef(new Set<string>());

  const commitItems = useCallback((next: DownloadedSeries[]) => {
    itemsRef.current = next;
    setItems(next);
    AsyncStorage.setItem(KEYS.items, JSON.stringify(next)).catch(() => {});
  }, []);

  /** Applies a change to the queue; `persist` is skipped for page-by-page progress. */
  const updateQueue = useCallback((fn: (q: Job[]) => Job[], persist = true) => {
    const next = fn(queueRef.current);
    queueRef.current = next;
    setQueue(next);
    if (persist) {
      const lean = next.map((j) => ({ series: j.series, chapter: j.chapter, state: 'queued', done: 0, total: 0 }));
      AsyncStorage.setItem(KEYS.queue, JSON.stringify(lean)).catch(() => {});
    }
  }, []);

  const setStartedKeys = useCallback((fn: (s: string[]) => string[]) => {
    const next = fn(startedRef.current);
    startedRef.current = next;
    setStarted(next);
    AsyncStorage.setItem(KEYS.started, JSON.stringify(next)).catch(() => {});
  }, []);

  const patch = useCallback(
    (k: string, p: Partial<Job>, persist = false) => updateQueue((q) => q.map((j) => (keyOf(j) === k ? { ...j, ...p } : j)), persist),
    [updateQueue],
  );

  const saveCover = async (series: Series) => {
    const existing = itemsRef.current.find((i) => i.series.key === series.key)?.cover;
    if (existing || !series.cover) return existing;
    try {
      const dir = seriesDir(series.key);
      await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      const ext = series.cover.split(/[?#]/)[0].match(/\.(jpe?g|png|webp)$/i)?.[1] ?? 'jpg';
      const dest = `${dir}cover.${ext}`;
      await downloadFile(series.cover, dest, imageHeaders(series));
      return dest;
    } catch {
      return undefined;
    }
  };

  const run = async (job: Job) => {
    const k = keyOf(job);
    const source = getSource(job.series.source);
    if (!source) return updateQueue((q) => q.filter((j) => keyOf(j) !== k));
    patch(k, { state: 'active', error: undefined });
    // Stops at the next page when the title is paused or the chapter removed; files already saved are kept.
    const shouldStop = () => removed.current.has(k) || !startedRef.current.includes(job.series.key);
    try {
      const urls = await source.pages(job.series, job.chapter);
      if (shouldStop()) throw new Error('Cancelled');
      const dir = chapterDir(job.series.key, job.chapter.id, true);
      const files = await fetchPages(urls, dir, source.imageHeaders, (done, total) => {
        patch(k, { done, total });
        updateBackground(`${job.series.title} · ${job.chapter.name} · ${done}/${total} pages`, done, total);
      }, shouldStop);
      const cover = await saveCover(job.series);
      const saved: DownloadedChapter = { ...job.chapter, files, ts: Date.now() };
      const list = itemsRef.current;
      const found = list.find((i) => i.series.key === job.series.key);
      commitItems(
        found
          ? list.map((i) =>
              i === found
                ? { ...i, cover: cover ?? i.cover, chapters: [...i.chapters.filter((c) => c.id !== saved.id), saved] }
                : i,
            )
          : [{ series: job.series, cover, chapters: [saved] }, ...list],
      );
      updateQueue((q) => q.filter((j) => keyOf(j) !== k));
    } catch (e) {
      if (removed.current.has(k)) {
        await removeDir(chapterDir(job.series.key, job.chapter.id, true));
        updateQueue((q) => q.filter((j) => keyOf(j) !== k));
      } else if (!startedRef.current.includes(job.series.key)) {
        patch(k, { state: 'queued' });
      } else {
        patch(k, { state: 'error', error: friendly(e) });
      }
    } finally {
      removed.current.delete(k);
    }
  };

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const job = queueRef.current.find((j) => j.state === 'queued' && startedRef.current.includes(j.series.key));
        if (!job) break;
        startBackground('Starting…');
        await run(job);
      }
    } finally {
      running.current = false;
      stopBackground();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore everything, then pick up where an interrupted download stopped.
  useEffect(() => {
    (async () => {
      const read = async <T,>(key: string, fallback: T): Promise<T> => {
        try {
          const raw = await AsyncStorage.getItem(key);
          return raw ? (JSON.parse(raw) as T) : fallback;
        } catch {
          return fallback;
        }
      };
      const [saved, q, s] = await Promise.all([
        read<DownloadedSeries[]>(KEYS.items, []),
        read<Job[]>(KEYS.queue, []),
        read<string[]>(KEYS.started, []),
      ]);
      itemsRef.current = saved;
      setItems(saved);
      // Chapters that finished while the queue was being saved are not downloaded twice.
      const pending = q
        .filter((j) => isKnownSource(j.series.source))
        .filter(
        (j) => !saved.find((i) => i.series.key === j.series.key)?.chapters.some((c) => c.id === j.chapter.id),
      );
      queueRef.current = pending;
      setQueue(pending);
      const live = s.filter((key) => pending.some((j) => j.series.key === key));
      startedRef.current = live;
      setStarted(live);
      pump();
    })();
  }, [pump]);

  const enqueue = useCallback(
    (series: Series, chapters: Chapter[]) => {
      const have = new Set(itemsRef.current.find((i) => i.series.key === series.key)?.chapters.map((c) => c.id));
      const queued = new Set(queueRef.current.filter((j) => j.series.key === series.key).map((j) => j.chapter.id));
      const fresh: Job[] = chapters
        .filter((c) => !have.has(c.id) && !queued.has(c.id))
        .map((chapter) => ({ series, chapter, state: 'queued', done: 0, total: 0 }));
      if (fresh.length) updateQueue((q) => [...q, ...fresh]);
      return fresh.length;
    },
    [updateQueue],
  );

  const start = useCallback(
    (seriesKey?: string) => {
      const keys = seriesKey ? [seriesKey] : [...new Set(queueRef.current.map((j) => j.series.key))];
      // Failed chapters are tried again when their title is started.
      updateQueue((q) => q.map((j) => (keys.includes(j.series.key) && j.state === 'error' ? { ...j, state: 'queued', error: undefined } : j)));
      setStartedKeys((s) => [...new Set([...s, ...keys])]);
      pump();
    },
    [pump, setStartedKeys, updateQueue],
  );

  const stop = useCallback(
    (seriesKey?: string) => setStartedKeys((s) => (seriesKey ? s.filter((k) => k !== seriesKey) : [])),
    [setStartedKeys],
  );

  const dropJob = useCallback(
    (k: string) => {
      const job = queueRef.current.find((j) => keyOf(j) === k);
      if (!job) return;
      if (job.state === 'active') removed.current.add(k);
      else removeDir(chapterDir(job.series.key, job.chapter.id, true));
      if (job.state !== 'active') updateQueue((q) => q.filter((j) => keyOf(j) !== k));
    },
    [updateQueue],
  );

  const cancel = useCallback((seriesKey: string, chapterId: string) => dropJob(jobKey(seriesKey, chapterId)), [dropJob]);

  const cancelSeries = useCallback(
    (seriesKey: string) => {
      for (const j of queueRef.current.filter((x) => x.series.key === seriesKey)) dropJob(keyOf(j));
      setStartedKeys((s) => s.filter((k) => k !== seriesKey));
    },
    [dropJob, setStartedKeys],
  );

  const retry = useCallback(
    (seriesKey: string, chapterId: string) => {
      patch(jobKey(seriesKey, chapterId), { state: 'queued', error: undefined }, true);
      start(seriesKey);
    },
    [patch, start],
  );

  const moveSeries = useCallback(
    (seriesKey: string, direction: -1 | 1) => {
      updateQueue((q) => {
        const order = [...new Set(q.map((j) => j.series.key))];
        const from = order.indexOf(seriesKey);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= order.length) return q;
        [order[from], order[to]] = [order[to], order[from]];
        // Chapters keep their order inside a title; titles follow the new order.
        return order.flatMap((k) => q.filter((j) => j.series.key === k));
      });
    },
    [updateQueue],
  );

  const removeChapter = useCallback(
    (seriesKey: string, chapterId: string) => {
      removeDir(chapterDir(seriesKey, chapterId, true));
      const next = itemsRef.current
        .map((i) => (i.series.key === seriesKey ? { ...i, chapters: i.chapters.filter((c) => c.id !== chapterId) } : i))
        .filter((i) => i.chapters.length > 0);
      if (!next.some((i) => i.series.key === seriesKey)) removeDir(seriesDir(seriesKey));
      commitItems(next);
    },
    [commitItems],
  );

  const removeSeries = useCallback(
    (seriesKey: string) => {
      removeDir(seriesDir(seriesKey));
      commitItems(itemsRef.current.filter((i) => i.series.key !== seriesKey));
    },
    [commitItems],
  );

  const value = useMemo<DownloadsContext>(() => {
    const byKey = new Map(items.map((i) => [i.series.key, i]));
    const jobs = new Map(queue.map((j) => [keyOf(j), j]));
    return {
      items,
      queue,
      started,
      getDownloaded: (k) => byKey.get(k),
      getChapter: (k, id) => byKey.get(k)?.chapters.find((c) => c.id === id),
      getJob: (k, id) => jobs.get(jobKey(k, id)),
      enqueue,
      start,
      stop,
      cancel,
      cancelSeries,
      retry,
      moveSeries,
      removeChapter,
      removeSeries,
    };
  }, [items, queue, started, enqueue, start, stop, cancel, cancelSeries, retry, moveSeries, removeChapter, removeSeries]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
