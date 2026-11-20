import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';

import { packSeries, unpackSeries } from './downloadPack';
import type { DownloadedSeries } from './types';
import { hash } from './util';

/**
 * The download list, the queue and the started titles are kept in files in the app's storage.
 *
 * They used to be in AsyncStorage, which on Android holds at most 6 MB in all and can't read back a single value
 * over about 2 MB. Once it was full every save failed without a word, so the list and queue on disk stayed as
 * they were at that moment and came back like that whenever Android restarted the app. Files have no such cap.
 */
const DIR = `${FS.documentDirectory}downloads-index/`;
const ORDER = `${DIR}order.json`;
const QUEUE = `${DIR}queue.json`;
const STARTED = `${DIR}started.json`;
const titleFile = (seriesKey: string) => `${DIR}t-${hash(seriesKey)}.json`;

const LEGACY = {
  oneRow: 'downloads1',
  index: 'downloads2',
  queue: 'downloadQueue1',
  started: 'downloadStarted1',
} as const;
const legacyRow = (seriesKey: string) => `${LEGACY.index}:${seriesKey}`;

let onError: (e: unknown) => void = () => {};
/** Called when something could not be saved. */
export const setSaveErrorHandler = (fn: (e: unknown) => void) => {
  onError = fn;
};

let dirMade: Promise<unknown> | null = null;

/** Writes the whole file or nothing: a kill halfway through leaves the previous version in place. */
async function writeFile(path: string, text: string) {
  dirMade ??= FS.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  await dirMade;
  const tmp = `${path}.tmp`;
  await FS.writeAsStringAsync(tmp, text);
  try {
    await FS.moveAsync({ from: tmp, to: path });
  } catch {
    // Moving onto an existing file fails on some platforms.
    await FS.deleteAsync(path, { idempotent: true });
    await FS.moveAsync({ from: tmp, to: path });
  }
}

/**
 * Writes happen one at a time, in the order asked. A file asked to be written again before its turn is written
 * once, with the latest content. `null` deletes it.
 */
const waiting = new Map<string, string | null>();
let chain: Promise<void> = Promise.resolve();

function put(path: string, text: string | null) {
  const queued = waiting.has(path);
  waiting.set(path, text);
  if (queued) return;
  chain = chain.then(async () => {
    const latest = waiting.get(path);
    waiting.delete(path);
    try {
      if (latest === null || latest === undefined) await FS.deleteAsync(path, { idempotent: true });
      else await writeFile(path, latest);
    } catch (e) {
      onError(e);
    }
  });
}

/** Resolves once everything asked so far is on disk. */
export const flushed = () => chain;

async function readFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await FS.readAsStringAsync(path));
  } catch {
    return undefined;
  }
}

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []);

/** Saves what changed between two versions of the list: new or changed titles, the order, and removed titles. */
export function saveItems(prev: DownloadedSeries[], next: DownloadedSeries[]) {
  const before = new Map(prev.map((i) => [i.series.key, i]));
  const after = new Set(next.map((i) => i.series.key));
  for (const i of next) if (before.get(i.series.key) !== i) put(titleFile(i.series.key), JSON.stringify(packSeries(i)));
  const sameOrder = prev.length === next.length && prev.every((i, n) => i.series.key === next[n].series.key);
  if (!sameOrder) put(ORDER, JSON.stringify(next.map((i) => i.series.key)));
  for (const i of prev) if (!after.has(i.series.key)) put(titleFile(i.series.key), null);
}

/** Saves every title and the order, e.g. after moving the list over from the old storage. */
export const saveAllItems = (items: DownloadedSeries[]) => saveItems([], items);

export const saveQueue = (queue: unknown[]) => put(QUEUE, JSON.stringify(queue));
export const saveStarted = (keys: string[]) => put(STARTED, JSON.stringify(keys));

async function readTitles(keys: string[]) {
  const rows = await Promise.all(keys.map((k) => readFile(titleFile(k))));
  const out: DownloadedSeries[] = [];
  rows.forEach((row, n) => {
    const item = unpackSeries(row);
    // A title whose file is missing (cut off between saves) or belongs to another key is left out.
    if (item && item.series.key === keys[n]) out.push(item);
  });
  return out;
}

async function readLegacy(): Promise<{ items: DownloadedSeries[]; queue: unknown; started: string[] }> {
  const json = async (key: string) => {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as unknown) : undefined;
    } catch {
      return undefined;
    }
  };
  const [index, oneRow, queue, started] = await Promise.all([
    json(LEGACY.index),
    json(LEGACY.oneRow),
    json(LEGACY.queue),
    json(LEGACY.started),
  ]);
  let items: DownloadedSeries[] = [];
  if (Array.isArray(index)) {
    // Read one at a time: a title too large to read back must not hide the others.
    for (const key of strings(index)) {
      const item = unpackSeries(await json(legacyRow(key)));
      if (item) items.push(item);
    }
  } else if (Array.isArray(oneRow)) {
    items = oneRow.map(unpackSeries).filter((i): i is DownloadedSeries => !!i);
  }
  return { items, queue, started: strings(started) };
}

async function removeLegacy() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const old = keys.filter(
      (k) => k === LEGACY.oneRow || k === LEGACY.index || k === LEGACY.queue || k === LEGACY.started || k.startsWith(`${LEGACY.index}:`),
    );
    if (old.length) await AsyncStorage.multiRemove(old);
  } catch {}
}

export type Stored = {
  items: DownloadedSeries[];
  queue: unknown;
  started: string[];
  /** True the first time, when the list was moved over from the old storage (which may have missed recent changes). */
  migrated: boolean;
};

export async function loadAll(): Promise<Stored> {
  const order = await readFile(ORDER);
  if (Array.isArray(order)) {
    const [items, queue, started] = await Promise.all([readTitles(strings(order)), readFile(QUEUE), readFile(STARTED)]);
    // Title files no longer in the list (removed, with the removal cut off) are cleaned up. Done before anything
    // else can be saved, so a title added just now is never mistaken for one.
    try {
      const keep = new Set(items.map((i) => titleFile(i.series.key)));
      for (const n of await FS.readDirectoryAsync(DIR)) if (n.startsWith('t-') && !keep.has(`${DIR}${n}`)) put(`${DIR}${n}`, null);
    } catch {}
    return { items, queue: queue ?? [], started: strings(started), migrated: false };
  }
  const legacy = await readLegacy();
  saveAllItems(legacy.items);
  // An empty list still gets its order file, so this move happens once.
  if (!legacy.items.length) put(ORDER, '[]');
  saveQueue(Array.isArray(legacy.queue) ? legacy.queue : []);
  saveStarted(legacy.started);
  await flushed();
  // The old copy is removed only once the files are written, so a failure here is tried again on the next start.
  if (Array.isArray(await readFile(ORDER))) await removeLegacy();
  return { ...legacy, queue: legacy.queue ?? [], migrated: true };
}
