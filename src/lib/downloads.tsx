import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { chapterDir, downloadFile, fetchPages, removeDir, seriesDir } from './files';
import { getSource, imageHeaders } from './sources';
import type { Chapter, DownloadedChapter, DownloadedSeries, Series } from './types';

const KEY = 'downloads1';

export type Job = {
  series: Series;
  chapter: Chapter;
  state: 'queued' | 'active' | 'error';
  done: number;
  total: number;
  error?: string;
};

const jobKey = (seriesKey: string, chapterId: string) => `${seriesKey}|${chapterId}`;

type DownloadsContext = {
  items: DownloadedSeries[];
  jobs: Record<string, Job>;
  getDownloaded: (seriesKey: string) => DownloadedSeries | undefined;
  getChapter: (seriesKey: string, chapterId: string) => DownloadedChapter | undefined;
  getJob: (seriesKey: string, chapterId: string) => Job | undefined;
  download: (series: Series, chapters: Chapter[]) => void;
  cancel: (seriesKey: string, chapterId: string) => void;
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
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const itemsRef = useRef(items);
  const queue = useRef<Job[]>([]);
  const running = useRef(false);
  const cancelled = useRef(new Set<string>());

  const commit = useCallback((next: DownloadedSeries[]) => {
    itemsRef.current = next;
    setItems(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as DownloadedSeries[];
        itemsRef.current = parsed;
        setItems(parsed);
      })
      .catch(() => {});
  }, []);

  const patchJob = useCallback((k: string, patch: Partial<Job> | null) => {
    setJobs((prev) => {
      const next = { ...prev };
      if (patch === null) delete next[k];
      else if (next[k]) next[k] = { ...next[k], ...patch };
      return next;
    });
  }, []);

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
    const k = jobKey(job.series.key, job.chapter.id);
    const source = getSource(job.series.source);
    if (!source) return patchJob(k, null);
    patchJob(k, { state: 'active' });
    try {
      const urls = await source.pages(job.series, job.chapter);
      const dir = chapterDir(job.series.key, job.chapter.id, true);
      const files = await fetchPages(
        urls,
        dir,
        source.imageHeaders,
        (done, total) => patchJob(k, { done, total }),
        () => cancelled.current.has(k),
      );
      const cover = await saveCover(job.series);
      const saved: DownloadedChapter = { ...job.chapter, files, ts: Date.now() };
      const list = itemsRef.current;
      const found = list.find((i) => i.series.key === job.series.key);
      const next = found
        ? list.map((i) =>
            i === found
              ? {
                  ...i,
                  cover: cover ?? i.cover,
                  chapters: [...i.chapters.filter((c) => c.id !== saved.id), saved],
                }
              : i,
          )
        : [{ series: job.series, cover, chapters: [saved] }, ...list];
      commit(next);
      patchJob(k, null);
    } catch (e) {
      if (cancelled.current.has(k)) {
        await removeDir(chapterDir(job.series.key, job.chapter.id, true));
        patchJob(k, null);
      } else {
        patchJob(k, { state: 'error', error: String((e as Error)?.message ?? e) });
      }
    } finally {
      cancelled.current.delete(k);
    }
  };

  const pump = async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length) {
        const job = queue.current.shift()!;
        if (cancelled.current.has(jobKey(job.series.key, job.chapter.id))) {
          cancelled.current.delete(jobKey(job.series.key, job.chapter.id));
          patchJob(jobKey(job.series.key, job.chapter.id), null);
          continue;
        }
        await run(job);
      }
    } finally {
      running.current = false;
    }
  };

  const download = (series: Series, chapters: Chapter[]) => {
    const fresh: Job[] = [];
    for (const chapter of chapters) {
      const k = jobKey(series.key, chapter.id);
      const have = itemsRef.current.find((i) => i.series.key === series.key)?.chapters.some((c) => c.id === chapter.id);
      const queued = queue.current.some((j) => jobKey(j.series.key, j.chapter.id) === k);
      if (have || queued) continue;
      fresh.push({ series, chapter, state: 'queued', done: 0, total: 0 });
    }
    if (!fresh.length) return;
    setJobs((prev) => {
      const next = { ...prev };
      for (const j of fresh) next[jobKey(j.series.key, j.chapter.id)] = j;
      return next;
    });
    queue.current.push(...fresh);
    pump();
  };

  const cancel = (seriesKey: string, chapterId: string) => {
    const k = jobKey(seriesKey, chapterId);
    const queued = queue.current.findIndex((j) => jobKey(j.series.key, j.chapter.id) === k);
    if (queued >= 0) {
      queue.current.splice(queued, 1);
      patchJob(k, null);
      return;
    }
    // Active jobs stop at the next page; failed ones are just dismissed.
    cancelled.current.add(k);
    setJobs((prev) => {
      if (prev[k]?.state !== 'error') return prev;
      cancelled.current.delete(k);
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  const removeChapter = (seriesKey: string, chapterId: string) => {
    removeDir(chapterDir(seriesKey, chapterId, true));
    const next = itemsRef.current
      .map((i) => (i.series.key === seriesKey ? { ...i, chapters: i.chapters.filter((c) => c.id !== chapterId) } : i))
      .filter((i) => i.chapters.length > 0);
    if (!next.some((i) => i.series.key === seriesKey)) removeDir(seriesDir(seriesKey));
    commit(next);
  };

  const removeSeries = (seriesKey: string) => {
    removeDir(seriesDir(seriesKey));
    commit(itemsRef.current.filter((i) => i.series.key !== seriesKey));
  };

  const value = useMemo<DownloadsContext>(() => {
    const byKey = new Map(items.map((i) => [i.series.key, i]));
    return {
      items,
      jobs,
      getDownloaded: (k) => byKey.get(k),
      getChapter: (k, id) => byKey.get(k)?.chapters.find((c) => c.id === id),
      getJob: (k, id) => jobs[jobKey(k, id)],
      download,
      cancel,
      removeChapter,
      removeSeries,
    };
    // The handlers only touch refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, jobs]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
