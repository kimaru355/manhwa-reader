import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Alert, AppState } from 'react-native';

import { backgroundTimeUp, startBackground, stopBackground, updateBackground } from './background';
import {
  folderSupported,
  folderUsable,
  pickDownloadFolder,
  saveChapterToFolder,
  saveCoverToFolder,
  scanFolder,
  STAGE,
  stageDir,
  writeManifest,
} from './downloadFolder';
import { friendly } from './errors';
import { loadAll, saveItems, saveQueue, saveStarted, setSaveErrorHandler } from './downloadStore';
import { chapterDir, downloadFile, fetchPages, fileExists, removeDir, seriesDir } from './files';
import { coverOf, getSource, imageHeaders } from './sources';
import type { Chapter, DownloadedChapter, DownloadedSeries, Folder, Series } from './types';
import { hash } from './util';

const KEYS = { folder: 'downloadFolder1' } as const;

/** A downloaded novel chapter: its paragraphs as a JSON array of strings. */
export const TEXT_FILE = 'text.json';
const TEXT_PAUSE_MS = 400;

/** Where new downloads go: a folder the user picked, or the app's own storage (deleted on uninstall). */
type FolderChoice = { mode: 'folder'; folder: Folder } | { mode: 'app' };

/** Where a downloaded chapter's pages are, in reading order. */
export const pageUris = (seriesKey: string, c: DownloadedChapter) => {
  if (c.uris) return c.uris;
  const dir = chapterDir(seriesKey, c.id, true);
  return c.files.map((f) => `${dir}${f}`);
};

/** Reads a downloaded novel chapter. Throws if it is missing or unreadable. */
export async function readDownloadedText(seriesKey: string, c: DownloadedChapter): Promise<string[]> {
  const uri = pageUris(seriesKey, c)[c.files.indexOf(TEXT_FILE)];
  if (!uri) throw new Error('Not a downloaded novel chapter');
  const paras = JSON.parse(await FS.readAsStringAsync(uri)) as unknown;
  if (!Array.isArray(paras) || !paras.length || !paras.every((p) => typeof p === 'string')) throw new Error('Unreadable chapter');
  return paras as string[];
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

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
/** What is saved of the queue: progress and errors start over after a restart. */
const leanQueue = (q: Job[]) => q.map((j) => ({ series: j.series, chapter: j.chapter, state: 'queued', done: 0, total: 0 }));

const hasChapter = (list: DownloadedSeries[], seriesKey: string, chapterId: string) =>
  !!list.find((i) => i.series.key === seriesKey)?.chapters.some((c) => c.id === chapterId);

/** Adds titles found in the download folder to the list. The folder's copy of a chapter wins. */
function mergeFound(list: DownloadedSeries[], found: DownloadedSeries[]) {
  for (const f of found) {
    const have = list.find((i) => i.series.key === f.series.key);
    if (!have) {
      list = [...list, f];
      continue;
    }
    const inFolder = new Set(have.chapters.filter((c) => c.uris).map((c) => c.id));
    const fresh = f.chapters.filter((c) => !inFolder.has(c.id));
    const freshIds = new Set(fresh.map((c) => c.id));
    // A copy of the chapter in the app's storage is deleted.
    for (const c of have.chapters) if (freshIds.has(c.id)) removeDir(chapterDir(f.series.key, c.id, true));
    list = list.map((i) =>
      i === have
        ? {
            ...i,
            dir: i.dir ?? f.dir,
            cover: i.cover?.startsWith('content:') ? i.cover : (f.cover ?? i.cover),
            chapters: [...i.chapters.filter((c) => !freshIds.has(c.id)), ...fresh],
          }
        : i,
    );
  }
  return list;
}

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
  /** Moves a title earlier (-1) or later (1) in the download order, or to the front ('top'). */
  moveSeries: (seriesKey: string, direction: -1 | 1 | 'top') => void;
  removeChapter: (seriesKey: string, chapterId: string) => void;
  /** Deletes several downloaded chapters of a title at once. */
  removeChapters: (seriesKey: string, chapterIds: string[]) => void;
  /** Takes several chapters of a title off the download list. */
  cancelChapters: (seriesKey: string, chapterIds: string[]) => void;
  removeSeries: (seriesKey: string) => void;
  /** The folder new downloads are saved in; null means the app's own storage. */
  folder: Folder | null;
  /** Whether the user has decided where downloads go (a folder, or the app's storage). */
  folderDecided: boolean;
  /** Set when the chosen folder could no longer be opened (after a reinstall, or it was deleted). */
  folderLost: boolean;
  /** Progress of moving downloads from the app's storage into the folder. */
  moving: { done: number; total: number } | null;
  /**
   * Lets the user pick a download folder. Downloads already in it are added to the list, and downloads in the
   * app's storage are moved into it. Returns how many titles were found there, or null if cancelled.
   */
  chooseFolder: () => Promise<{ found: number } | null>;
  /** Keeps new downloads in the app's storage. */
  keepInAppStorage: () => void;
  /** Asks where to save downloads if the user hasn't decided yet. Resolves false if they cancelled. */
  ensureFolder: () => Promise<boolean>;
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
  const [choice, setChoice] = useState<FolderChoice | null>(null);
  const choiceRef = useRef(choice);
  const [folderLost, setFolderLost] = useState(false);
  const [moving, setMoving] = useState<{ done: number; total: number } | null>(null);
  const movingRef = useRef(false);
  const folderOf = () => (choiceRef.current?.mode === 'folder' ? choiceRef.current.folder : null);

  /**
   * Nothing is saved until what is on disk has been read: saving earlier would replace it. Changes made before
   * then are merged into what was read, and saved with it.
   */
  const loaded = useRef(false);

  useEffect(() => {
    let told = false;
    setSaveErrorHandler((e) => {
      if (told) return;
      told = true;
      Alert.alert('Couldn’t save your downloads list', `Changes may be lost when the app restarts. ${friendly(e)}`);
    });
  }, []);

  const commitItems = useCallback((next: DownloadedSeries[]) => {
    const prev = itemsRef.current;
    itemsRef.current = next;
    setItems(next);
    if (loaded.current) saveItems(prev, next);
  }, []);

  /** Rewrites the description of a title kept in the folder. One at a time, from the latest list. */
  const manifests = useRef<Promise<void>>(Promise.resolve());
  const refreshManifest = useCallback((seriesKey: string) => {
    manifests.current = manifests.current
      .then(() => {
        const item = itemsRef.current.find((i) => i.series.key === seriesKey);
        return item?.dir ? writeManifest(item) : undefined;
      })
      .catch(() => {});
  }, []);

  /** Changes one title in the list as it is now, so changes made meanwhile are not lost. */
  const updateItem = useCallback(
    (seriesKey: string, fn: (i: DownloadedSeries) => DownloadedSeries) =>
      commitItems(itemsRef.current.map((i) => (i.series.key === seriesKey ? fn(i) : i))),
    [commitItems],
  );

  const setFolderChoice = useCallback((next: FolderChoice) => {
    choiceRef.current = next;
    setChoice(next);
    AsyncStorage.setItem(KEYS.folder, JSON.stringify(next)).catch(() => {});
  }, []);

  /** Applies a change to the queue; `persist` is skipped for page-by-page progress. */
  const updateQueue = useCallback((fn: (q: Job[]) => Job[], persist = true) => {
    const next = fn(queueRef.current);
    queueRef.current = next;
    setQueue(next);
    if (persist && loaded.current) saveQueue(leanQueue(next));
  }, []);

  const setStartedKeys = useCallback((fn: (s: string[]) => string[]) => {
    const next = fn(startedRef.current);
    startedRef.current = next;
    setStarted(next);
    if (loaded.current) saveStarted(next);
  }, []);

  const patch = useCallback(
    (k: string, p: Partial<Job>, persist = false) => updateQueue((q) => q.map((j) => (keyOf(j) === k ? { ...j, ...p } : j)), persist),
    [updateQueue],
  );

  const saveCover = async (series: Series, folder: Folder | null) => {
    // A cover already in the app's storage is moved into the folder along with the chapters.
    const existing = itemsRef.current.find((i) => i.series.key === series.key)?.cover;
    const url = coverOf(series);
    if (existing || !url) return existing;
    try {
      const dir = folder ? `${STAGE}cover-${hash(series.key)}/` : seriesDir(series.key);
      await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      const ext = url.split(/[?#]/)[0].match(/\.(jpe?g|png|webp)$/i)?.[1] ?? 'jpg';
      const dest = `${dir}cover.${ext}`;
      await downloadFile(url, dest, imageHeaders(series));
      if (!folder) return dest;
      try {
        return (await saveCoverToFolder(folder.uri, series, dest)).uri;
      } finally {
        removeDir(dir);
      }
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
      // With a download folder, pages are gathered in the app's cache and copied over once they are all in.
      const folder = folderOf();
      const dir = folder ? stageDir(job.series.key, job.chapter.id) : chapterDir(job.series.key, job.chapter.id, true);
      let files: string[];
      if (source.kind === 'text' && source.text) {
        // A novel chapter is one file holding its paragraphs.
        updateBackground(`${job.series.title} · ${job.chapter.name}`, 0, 1);
        const paras = await source.text(job.series, job.chapter);
        if (shouldStop()) throw new Error('Cancelled');
        await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
        await FS.writeAsStringAsync(`${dir}${TEXT_FILE}`, JSON.stringify(paras));
        files = [TEXT_FILE];
        patch(k, { done: 1, total: 1 });
        // Hundreds of chapters back to back would get the reader's address blocked by the site for a while.
        await new Promise((r) => setTimeout(r, TEXT_PAUSE_MS));
      } else {
        const urls = await source.pages(job.series, job.chapter);
        if (shouldStop()) throw new Error('Cancelled');
        files = await fetchPages(urls, dir, source.imageHeaders, (done, total) => {
          patch(k, { done, total });
          updateBackground(`${job.series.title} · ${job.chapter.name} · ${done}/${total} pages`, done, total);
        }, shouldStop);
      }
      let saved: DownloadedChapter = { ...job.chapter, files, ts: Date.now() };
      let folderDir: string | undefined;
      if (folder) {
        updateBackground(`${job.series.title} · ${job.chapter.name} · saving to folder`, files.length, files.length);
        const res = await saveChapterToFolder(folder.uri, job.series, job.chapter, dir, files);
        saved = { ...saved, dir: res.dir, uris: res.uris };
        folderDir = res.seriesDir;
        removeDir(dir);
      }
      const cover = await saveCover(job.series, folder);
      const list = itemsRef.current;
      const found = list.find((i) => i.series.key === job.series.key);
      commitItems(
        found
          ? list.map((i) =>
              i === found
                ? {
                    ...i,
                    cover: cover ?? i.cover,
                    dir: folderDir ?? i.dir,
                    chapters: [...i.chapters.filter((c) => c.id !== saved.id), saved],
                  }
                : i,
            )
          : [{ series: job.series, cover, ...(folderDir ? { dir: folderDir } : {}), chapters: [saved] }, ...list],
      );
      if (folderDir) refreshManifest(job.series.key);
      updateQueue((q) => q.filter((j) => keyOf(j) !== k));
    } catch (e) {
      if (removed.current.has(k)) {
        await removeDir(chapterDir(job.series.key, job.chapter.id, true));
        await removeDir(stageDir(job.series.key, job.chapter.id));
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
    const nextJob = () =>
      queueRef.current.find((j) => j.state === 'queued' && startedRef.current.includes(j.series.key));
    // Once Android's daily allowance for background downloading is used up, downloads carry on only while the
    // app is on screen (without the background service); otherwise they wait until it is opened again.
    const mayRun = () => !backgroundTimeUp() || AppState.currentState === 'active';
    try {
      // Stays "running" while the service stops, then looks again: a title started meanwhile is picked up here.
      while (nextJob() && mayRun()) {
        try {
          for (let job = nextJob(); job && mayRun(); job = nextJob()) {
            if (backgroundTimeUp()) await stopBackground();
            else startBackground('Starting…');
            await run(job);
          }
        } finally {
          await stopBackground();
        }
      }
    } finally {
      running.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore everything, then pick up where an interrupted download stopped.
  useEffect(() => {
    (async () => {
      const [stored, rawChoice] = await Promise.all([loadAll(), readJson<FolderChoice | null>(KEYS.folder, null)]);
      if (rawChoice?.mode === 'app') {
        choiceRef.current = rawChoice;
        setChoice(rawChoice);
      } else if (rawChoice?.mode === 'folder' && typeof rawChoice.folder?.uri === 'string') {
        // Access to the folder does not survive a reinstall (the setting itself can, through Android's backup),
        // so the user is asked again before the next download.
        if (folderSupported && (await folderUsable(rawChoice.folder.uri))) {
          choiceRef.current = rawChoice;
          setChoice(rawChoice);
        } else {
          setFolderLost(true);
          AsyncStorage.removeItem(KEYS.folder).catch(() => {});
        }
      }
      const q = (Array.isArray(stored.queue) ? (stored.queue as Job[]) : []).filter((j) => j?.series?.key && j?.chapter?.id);
      // Changes made while loading (a folder chosen, chapters added) are kept.
      const saved = itemsRef.current.length ? mergeFound(stored.items, itemsRef.current) : stored.items;
      const restored = new Set(q.map(keyOf));
      const all = [...q, ...queueRef.current.filter((j) => !restored.has(keyOf(j)))];
      // Chapters that finished while the queue was being saved are not downloaded twice.
      const pending = all.filter((j) => !hasChapter(saved, j.series.key, j.chapter.id));
      const live = [...new Set([...stored.started, ...startedRef.current])].filter((key) =>
        pending.some((j) => j.series.key === key),
      );
      itemsRef.current = saved;
      setItems(saved);
      queueRef.current = pending;
      setQueue(pending);
      startedRef.current = live;
      setStarted(live);
      loaded.current = true;
      saveItems(stored.items, saved);
      saveQueue(leanQueue(pending));
      saveStarted(live);
      pump();
      // The old storage stopped saving once it was full, so chapters saved to the folder after that were missing
      // from the list. Each title's folder describes its chapters, so they are found there.
      const folder = folderOf();
      if (stored.migrated && folder) {
        const found = await scanFolder(folder.uri).catch(() => []);
        if (!found.length) return;
        commitItems(mergeFound(itemsRef.current, found));
        updateQueue((jobs) => jobs.filter((j) => j.state === 'active' || !hasChapter(itemsRef.current, j.series.key, j.chapter.id)));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pump]);

  // Opening the app renews the background allowance: carry on with anything that was waiting for it.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') pump();
    });
    return () => sub.remove();
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
      else {
        removeDir(chapterDir(job.series.key, job.chapter.id, true));
        removeDir(stageDir(job.series.key, job.chapter.id));
      }
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
    (seriesKey: string, direction: -1 | 1 | 'top') => {
      updateQueue((q) => {
        const order = [...new Set(q.map((j) => j.series.key))];
        const from = order.indexOf(seriesKey);
        if (direction === 'top') {
          if (from <= 0) return q;
          order.splice(from, 1);
          order.unshift(seriesKey);
        } else {
          const to = from + direction;
          if (from < 0 || to < 0 || to >= order.length) return q;
          [order[from], order[to]] = [order[to], order[from]];
        }
        // Chapters keep their order inside a title; titles follow the new order.
        return order.flatMap((k) => q.filter((j) => j.series.key === k));
      });
    },
    [updateQueue],
  );

  /** Deletes some downloaded chapters of a title (and the title, once none are left). */
  const removeChapters = useCallback(
    (seriesKey: string, chapterIds: string[]) => {
      const ids = new Set(chapterIds);
      const item = itemsRef.current.find((i) => i.series.key === seriesKey);
      if (!item) return;
      for (const c of item.chapters) if (ids.has(c.id)) removeDir(c.dir ?? chapterDir(seriesKey, c.id, true));
      const next = itemsRef.current
        .map((i) => (i.series.key === seriesKey ? { ...i, chapters: i.chapters.filter((c) => !ids.has(c.id)) } : i))
        .filter((i) => i.chapters.length > 0);
      const left = next.some((i) => i.series.key === seriesKey);
      if (!left) {
        removeDir(seriesDir(seriesKey));
        if (item.dir) removeDir(item.dir);
      }
      commitItems(next);
      if (left && item.dir) refreshManifest(seriesKey);
    },
    [commitItems, refreshManifest],
  );

  const removeChapter = useCallback(
    (seriesKey: string, chapterId: string) => removeChapters(seriesKey, [chapterId]),
    [removeChapters],
  );

  /** Takes chapters of a title off the download list (deleting what was partly downloaded). */
  const cancelChapters = useCallback(
    (seriesKey: string, chapterIds: string[]) => {
      const keys = new Set(chapterIds.map((id) => jobKey(seriesKey, id)));
      const drop = new Set<string>();
      for (const job of queueRef.current) {
        const k = keyOf(job);
        if (!keys.has(k)) continue;
        // A running chapter stops at its next page and removes itself.
        if (job.state === 'active') removed.current.add(k);
        else {
          drop.add(k);
          removeDir(chapterDir(job.series.key, job.chapter.id, true));
          removeDir(stageDir(job.series.key, job.chapter.id));
        }
      }
      if (drop.size) updateQueue((q) => q.filter((j) => !drop.has(keyOf(j))));
    },
    [updateQueue],
  );

  const removeSeries = useCallback(
    (seriesKey: string) => {
      const item = itemsRef.current.find((i) => i.series.key === seriesKey);
      removeDir(seriesDir(seriesKey));
      if (item?.dir) removeDir(item.dir);
      commitItems(itemsRef.current.filter((i) => i.series.key !== seriesKey));
    },
    [commitItems],
  );

  /** Moves chapters and covers kept in the app's storage into the folder, one chapter at a time. */
  const moveIntoFolder = useCallback(
    async (folder: Folder) => {
      if (movingRef.current) return;
      movingRef.current = true;
      const total = itemsRef.current.reduce((n, i) => n + i.chapters.filter((c) => !c.uris).length, 0);
      let done = 0;
      if (total) setMoving({ done, total });
      try {
        for (const key of itemsRef.current.map((i) => i.series.key)) {
          const item = itemsRef.current.find((i) => i.series.key === key);
          if (!item) continue;
          let moved = false;
          for (const c of item.chapters.filter((x) => !x.uris)) {
            // Stops if the user picked another folder or switched to the app's storage meanwhile.
            if (folderOf()?.uri !== folder.uri) return;
            // Deleted by the user while waiting.
            if (!itemsRef.current.find((i) => i.series.key === key)?.chapters.some((x) => x.id === c.id && !x.uris)) continue;
            const local = chapterDir(key, c.id, true);
            try {
              const intact = (await Promise.all(c.files.map((f) => fileExists(`${local}${f}`)))).every(Boolean);
              if (intact) {
                const res = await saveChapterToFolder(folder.uri, item.series, c, local, c.files);
                updateItem(key, (i) => ({
                  ...i,
                  dir: res.seriesDir,
                  chapters: i.chapters.map((x) => (x.id === c.id ? { ...x, dir: res.dir, uris: res.uris } : x)),
                }));
                moved = true;
                await removeDir(local);
              }
            } catch {
              // Stays in the app's storage; it is tried again the next time a folder is chosen.
            }
            setMoving({ done: ++done, total });
          }
          const now = itemsRef.current.find((i) => i.series.key === key);
          if (now?.cover?.startsWith('file:')) {
            try {
              const res = await saveCoverToFolder(folder.uri, now.series, now.cover);
              updateItem(key, (i) => ({ ...i, dir: i.dir ?? res.seriesDir, cover: res.uri }));
              moved = true;
            } catch {}
          }
          const after = itemsRef.current.find((i) => i.series.key === key);
          if (after && after.chapters.every((x) => x.uris) && !after.cover?.startsWith('file:')) removeDir(seriesDir(key));
          if (moved) refreshManifest(key);
        }
      } finally {
        movingRef.current = false;
        setMoving(null);
      }
    },
    [refreshManifest, updateItem],
  );

  const chooseFolder = useCallback(async () => {
    const folder = await pickDownloadFolder();
    if (!folder) return null;
    // Downloads already in the folder (from before a reinstall, or another phone) join the list.
    const found = await scanFolder(folder.uri);
    if (found.length) commitItems(mergeFound(itemsRef.current, found));
    setFolderLost(false);
    setFolderChoice({ mode: 'folder', folder });
    moveIntoFolder(folder);
    return { found: found.length };
  }, [commitItems, moveIntoFolder, setFolderChoice]);

  const keepInAppStorage = useCallback(() => setFolderChoice({ mode: 'app' }), [setFolderChoice]);

  const ensureFolder = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        if (!folderSupported || choiceRef.current) return resolve(true);
        Alert.alert(
          'Where should downloads be saved?',
          'Choose a folder on your phone to keep downloaded chapters even if the app is uninstalled. ' +
            'If you used a folder before reinstalling, choose it again to get those chapters back.\n\n' +
            'Chapters kept in the app’s storage are deleted when the app is uninstalled. You can change this in Settings.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'App storage', onPress: () => (keepInAppStorage(), resolve(true)) },
            {
              text: 'Choose folder',
              onPress: () =>
                chooseFolder()
                  .then((r) => resolve(!!r))
                  .catch((e) => {
                    Alert.alert('Couldn’t use that folder', friendly(e));
                    resolve(false);
                  }),
            },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      }),
    [chooseFolder, keepInAppStorage],
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
      removeChapters,
      cancelChapters,
      removeSeries,
      folder: choice?.mode === 'folder' ? choice.folder : null,
      folderDecided: !folderSupported || !!choice,
      folderLost,
      moving,
      chooseFolder,
      keepInAppStorage,
      ensureFolder,
    };
  }, [
    items,
    queue,
    started,
    enqueue,
    start,
    stop,
    cancel,
    cancelSeries,
    retry,
    moveSeries,
    removeChapter,
    removeChapters,
    cancelChapters,
    removeSeries,
    choice,
    folderLost,
    moving,
    chooseFolder,
    keepInAppStorage,
    ensureFolder,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
